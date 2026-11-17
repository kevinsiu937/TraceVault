import type { Bindings, Condition } from "./Condition.js";

/**
 * `{ same_as: name }`: the fact equals the value an earlier step bound as
 * `name`. When that step bound nothing, nothing is the same.
 */
export class SameAsCondition implements Condition {
  private constructor(private readonly binding: string) {}

  static parse(argument: unknown): Condition {
    if (typeof argument !== "string" || argument.length === 0) {
      throw new TypeError("expects the name of a value bound by an earlier step");
    }
    return new SameAsCondition(argument);
  }

  matches(value: string | null, bound: Bindings): boolean {
    return value !== null && value === bound.get(this.binding);
  }
}
