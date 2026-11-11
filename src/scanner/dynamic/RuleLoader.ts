import type { Severity } from "../../schema/Finding.js";
import { DurationWindow } from "./DurationWindow.js";
import { Rule } from "./Rule.js";
import { RuleLoadError } from "../rules/RuleLoadError.js";
import { RuleYaml } from "../rules/RuleYaml.js";
import type { RuleStep } from "./RuleStep.js";
import type { RuleStepLoader } from "./RuleStepLoader.js";

const RULE_KEYS = ["id", "version", "severity", "explanation", "window", "steps", "blockable"] as const;
const SEVERITIES: readonly Severity[] = ["low", "medium", "high"];

type Fields = Record<string, unknown>;

/**
 * Parses one rule file into a Rule, or throws a RuleLoadError naming the file
 * and the field. It accepts exactly the documented keys: a typo is an error,
 * never a silently ignored condition.
 */
export class RuleLoader {
  constructor(
    private readonly steps: RuleStepLoader,
    private readonly yaml: RuleYaml = new RuleYaml(),
  ) {}

  load(file: string, text: string, expectedId: string): Rule {
    const document = this.yaml.parse(file, text);
    const fields = this.object(document, file, "rule");
    for (const key of Object.keys(fields)) {
      if (!(RULE_KEYS as readonly string[]).includes(key)) {
        throw new RuleLoadError(file, key, "unknown key");
      }
    }

    const id = this.string(fields, "id", file);
    if (id !== expectedId) {
      throw new RuleLoadError(file, "id", `must match the file name ('${expectedId}')`);
    }
    const version = this.required(fields, "version", file);
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
      throw new RuleLoadError(file, "version", "must be a positive integer");
    }
    const severity = this.string(fields, "severity", file);
    if (!(SEVERITIES as readonly string[]).includes(severity)) {
      throw new RuleLoadError(file, "severity", `must be one of ${SEVERITIES.join(", ")}`);
    }
    const explanation = this.string(fields, "explanation", file);
    const steps = this.stepList(fields, file);
    const spansEvents = steps.length > 1 || steps.some((step) => step.repeat > 1);
    const window = this.window(fields, file, spansEvents);
    const blockable = this.blockable(fields, file, spansEvents || steps.some((step) => step.tests("outcome")));

    return new Rule(id, version, severity as Severity, explanation, steps, window, blockable);
  }

  private stepList(fields: Fields, file: string): readonly [RuleStep, ...RuleStep[]] {
    const steps = this.required(fields, "steps", file);
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new RuleLoadError(file, "steps", "must be a non-empty list");
    }
    const loaded = steps.map((step, index) => this.steps.load(step, file, `steps[${index}]`));
    loaded.slice(0, -1).forEach((step, index) => {
      if (step.each) {
        throw new RuleLoadError(file, `steps[${index}].each`, "only the last step may say each");
      }
    });
    const [first, ...rest] = loaded;
    if (first === undefined) {
      throw new RuleLoadError(file, "steps", "must be a non-empty list");
    }
    return [first, ...rest];
  }

  /** The guard sees one pending call, which has no outcome yet, so only a rule that needs neither can block it. */
  private blockable(fields: Fields, file: string, needsMoreThanTheCall: boolean): boolean {
    const blockable = fields["blockable"] ?? false;
    if (typeof blockable !== "boolean") {
      throw new RuleLoadError(file, "blockable", "must be true or false");
    }
    if (blockable && needsMoreThanTheCall) {
      throw new RuleLoadError(file, "blockable", "only a rule that matches one event, without testing its outcome, can block");
    }
    return blockable;
  }

  private window(fields: Fields, file: string, spansEvents: boolean): DurationWindow | null {
    if (!Object.hasOwn(fields, "window")) {
      if (spansEvents) {
        throw new RuleLoadError(file, "window", "required when a rule spans more than one event");
      }
      return null;
    }
    if (fields["window"] === "session") {
      return new DurationWindow(Number.POSITIVE_INFINITY);
    }
    const window = this.object(fields["window"], file, "window");
    const keys = Object.keys(window);
    const seconds = window["seconds"];
    if (keys.length !== 1 || typeof seconds !== "number" || !(seconds > 0)) {
      throw new RuleLoadError(file, "window", "must be { seconds: <positive number> } or session");
    }
    return new DurationWindow(seconds * 1000);
  }

  private object(value: unknown, file: string, field: string): Fields {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new RuleLoadError(file, field, "must be a mapping");
    }
    return value as Fields;
  }

  private required(fields: Fields, key: string, file: string): unknown {
    if (!Object.hasOwn(fields, key)) {
      throw new RuleLoadError(file, key, "required");
    }
    return fields[key];
  }

  private string(fields: Fields, key: string, file: string): string {
    const value = this.required(fields, key, file);
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new RuleLoadError(file, key, "must be a non-empty string");
    }
    return value;
  }
}
