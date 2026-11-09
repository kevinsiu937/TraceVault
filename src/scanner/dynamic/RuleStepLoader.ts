import { FACT_NAMES, type FactName } from "../../schema/EventFacts.js";
import type { Condition } from "./Condition.js";
import type { ConditionRegistry } from "./ConditionRegistry.js";
import type { NamedLists } from "./NamedLists.js";
import { RuleLoadError } from "./RuleLoadError.js";
import { RuleStep, type StepAlternative } from "./RuleStep.js";

type Fields = Record<string, unknown>;

/**
 * Parses one entry of a rule's `steps`: either `match: {fact: {operator: arg}}`
 * or `any: [{label, match}]`, with optional `repeat: n`, `each: true` and
 * `bind: {fact: name}` (remember a fact for later steps' conditions). An argument written
 * `{ list: name }` is replaced by that named list before the operator sees it.
 */
export class RuleStepLoader {
  constructor(
    private readonly conditions: ConditionRegistry,
    private readonly lists: NamedLists,
  ) {}

  load(value: unknown, file: string, field: string): RuleStep {
    const step = this.object(value, file, field);
    const keys = Object.keys(step);
    for (const key of keys) {
      if (key !== "match" && key !== "any" && key !== "repeat" && key !== "each" && key !== "bind") {
        throw new RuleLoadError(file, `${field}.${key}`, "unknown key");
      }
    }
    if (Object.hasOwn(step, "match") === Object.hasOwn(step, "any")) {
      throw new RuleLoadError(file, field, "must have exactly one of 'match' or 'any'");
    }
    const repeat = this.repeat(step, file, field);
    const each = step["each"] ?? false;
    if (typeof each !== "boolean") {
      throw new RuleLoadError(file, `${field}.each`, "must be true or false");
    }
    const binds = this.binds(step, file, field);
    if (Object.hasOwn(step, "match")) {
      return new RuleStep(
        [{ label: null, conditions: this.match(step["match"], file, `${field}.match`) }],
        repeat,
        each,
        binds,
      );
    }
    const any = step["any"];
    if (!Array.isArray(any) || any.length === 0) {
      throw new RuleLoadError(file, `${field}.any`, "must be a non-empty list");
    }
    return new RuleStep(
      any.map((entry, index) => this.alternative(entry, file, `${field}.any[${index}]`)),
      repeat,
      each,
      binds,
    );
  }

  private binds(step: Fields, file: string, field: string): ReadonlyMap<FactName, string> {
    const binds = new Map<FactName, string>();
    if (!Object.hasOwn(step, "bind")) {
      return binds;
    }
    for (const [fact, name] of Object.entries(this.object(step["bind"], file, `${field}.bind`))) {
      if (!(FACT_NAMES as readonly string[]).includes(fact)) {
        throw new RuleLoadError(file, `${field}.bind.${fact}`, `unknown fact (known: ${FACT_NAMES.join(", ")})`);
      }
      if (typeof name !== "string" || name.length === 0) {
        throw new RuleLoadError(file, `${field}.bind.${fact}`, "must name the binding");
      }
      binds.set(fact as FactName, name);
    }
    return binds;
  }

  private repeat(step: Fields, file: string, field: string): number {
    if (!Object.hasOwn(step, "repeat")) {
      return 1;
    }
    const repeat = step["repeat"];
    if (typeof repeat !== "number" || !Number.isInteger(repeat) || repeat < 1) {
      throw new RuleLoadError(file, `${field}.repeat`, "must be a whole number of at least 1");
    }
    return repeat;
  }

  private alternative(value: unknown, file: string, field: string): StepAlternative {
    const entry = this.object(value, file, field);
    for (const key of Object.keys(entry)) {
      if (key !== "label" && key !== "match") {
        throw new RuleLoadError(file, `${field}.${key}`, "unknown key");
      }
    }
    const label = entry["label"];
    if (typeof label !== "string" || label.trim().length === 0) {
      throw new RuleLoadError(file, `${field}.label`, "required: a non-empty string naming this pattern");
    }
    return { label, conditions: this.match(entry["match"], file, `${field}.match`) };
  }

  private match(value: unknown, file: string, field: string): ReadonlyMap<FactName, Condition> {
    const match = this.object(value, file, field);
    const conditions = new Map<FactName, Condition>();

    for (const [fact, spec] of Object.entries(match)) {
      const factField = `${field}.${fact}`;
      if (!(FACT_NAMES as readonly string[]).includes(fact)) {
        throw new RuleLoadError(file, factField, `unknown fact (known: ${FACT_NAMES.join(", ")})`);
      }
      const operators = Object.entries(this.object(spec, file, factField));
      const [entry] = operators;
      if (entry === undefined || operators.length !== 1) {
        throw new RuleLoadError(file, factField, "must name exactly one operator");
      }
      const [operator, argument] = entry;
      const resolved = this.resolve(argument, file, `${factField}.${operator}`);
      try {
        conditions.set(fact as FactName, this.conditions.parse(operator, resolved));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const where = message.startsWith("unknown operator") ? factField : `${factField}.${operator}`;
        throw new RuleLoadError(file, where, message);
      }
    }
    if (conditions.size === 0) {
      throw new RuleLoadError(file, field, "must test at least one fact");
    }
    return conditions;
  }

  private resolve(argument: unknown, file: string, field: string): unknown {
    if (typeof argument !== "object" || argument === null || Array.isArray(argument)) {
      return argument;
    }
    const keys = Object.keys(argument);
    if (keys.length !== 1 || keys[0] !== "list") {
      return argument;
    }
    const name = (argument as Fields)["list"];
    const items = typeof name === "string" ? this.lists.items(name) : undefined;
    if (items === undefined) {
      throw new RuleLoadError(file, field, `unknown list '${String(name)}'`);
    }
    return items;
  }

  private object(value: unknown, file: string, field: string): Fields {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new RuleLoadError(file, field, "must be a mapping");
    }
    return value as Fields;
  }
}
