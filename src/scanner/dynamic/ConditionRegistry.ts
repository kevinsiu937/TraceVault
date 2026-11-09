import type { Condition, ConditionParser } from "./Condition.js";

/**
 * The match operators a rule file may use, by name. The composition root
 * registers them; a new operator is a new Condition class plus one entry there.
 */
export class ConditionRegistry {
  constructor(private readonly parsers: Readonly<Record<string, ConditionParser>>) {}

  /** Throws a plain message; the loader adds the file and field. */
  parse(operator: string, argument: unknown): Condition {
    const parser = Object.hasOwn(this.parsers, operator) ? this.parsers[operator] : undefined;
    if (parser === undefined) {
      throw new TypeError(`unknown operator '${operator}'`);
    }
    return parser(argument);
  }
}
