import type { Bindings, Condition } from "./Condition.js";
import { PermissionPattern } from "./PermissionPattern.js";

/**
 * `{ allowed_by: name }`: the fact is a command that one of the permission
 * patterns an earlier step bound as `name` allows. The bound value holds one
 * pattern per line.
 */
export class AllowedByCondition implements Condition {
  private constructor(private readonly binding: string) {}

  static parse(argument: unknown): Condition {
    if (typeof argument !== "string" || argument.length === 0) {
      throw new TypeError("expects the name of permission patterns bound by an earlier step");
    }
    return new AllowedByCondition(argument);
  }

  matches(value: string | null, bound: Bindings): boolean {
    const patterns = bound.get(this.binding);
    if (value === null || patterns === undefined) {
      return false;
    }
    return patterns.split("\n").some((pattern) => PermissionPattern.of(pattern).allows(value));
  }
}
