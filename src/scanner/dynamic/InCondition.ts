import type { Condition } from "./Condition.js";

/** `{ in: [a, b] }`: the fact is one of these strings. */
export class InCondition implements Condition {
  private constructor(private readonly allowed: ReadonlySet<string>) {}

  static parse(argument: unknown): Condition {
    if (
      !Array.isArray(argument) ||
      argument.length === 0 ||
      !argument.every((item) => typeof item === "string" && item.length > 0)
    ) {
      throw new TypeError("expects a list of non-empty strings");
    }
    return new InCondition(new Set(argument as string[]));
  }

  matches(value: string | null): boolean {
    return value !== null && this.allowed.has(value);
  }
}
