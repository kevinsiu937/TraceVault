import type { Bindings, Condition } from "./Condition.js";

/**
 * `{ other_than: name }`: the fact differs from the value an earlier step
 * bound as `name`. When that step bound nothing, any value differs.
 */
export class OtherThanCondition implements Condition {
  private constructor(private readonly binding: string) {}

  static parse(argument: unknown): Condition {
    if (typeof argument !== "string" || argument.length === 0) {
      throw new TypeError("expects the name of a value bound by an earlier step");
    }
    return new OtherThanCondition(argument);
  }

  matches(value: string | null, bound: Bindings): boolean {
    return value !== null && value !== bound.get(this.binding);
  }
}
