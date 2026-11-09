import type { Condition } from "./Condition.js";

/** `{ regex: pattern }`: the fact contains a match, ignoring case. */
export class RegexCondition implements Condition {
  private constructor(private readonly pattern: RegExp) {}

  static parse(argument: unknown): Condition {
    if (typeof argument !== "string" || argument.length === 0) {
      throw new TypeError("expects a non-empty regular expression string");
    }
    try {
      return new RegexCondition(new RegExp(argument, "i"));
    } catch (error) {
      throw new TypeError(`does not compile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  matches(value: string | null): boolean {
    return value !== null && this.pattern.test(value);
  }
}
