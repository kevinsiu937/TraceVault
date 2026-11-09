import type { Condition } from "./Condition.js";

/** `{ equals: value }`: the fact is exactly this string. */
export class EqualsCondition implements Condition {
  private constructor(private readonly expected: string) {}

  static parse(argument: unknown): Condition {
    if (typeof argument !== "string" || argument.length === 0) {
      throw new TypeError("expects a non-empty string");
    }
    return new EqualsCondition(argument);
  }

  matches(value: string | null): boolean {
    return value === this.expected;
  }
}
