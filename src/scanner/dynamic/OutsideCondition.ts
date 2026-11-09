import type { Bindings, Condition } from "./Condition.js";
import { NormalisedPath } from "./NormalisedPath.js";

/**
 * `{ outside: name }`: the fact is an absolute path that is not the folder an
 * earlier step bound as `name`, nor anything under it. A relative path is
 * relative to that folder, so it counts as inside.
 */
export class OutsideCondition implements Condition {
  private constructor(private readonly binding: string) {}

  static parse(argument: unknown): Condition {
    if (typeof argument !== "string" || argument.length === 0) {
      throw new TypeError("expects the name of a folder bound by an earlier step");
    }
    return new OutsideCondition(argument);
  }

  matches(value: string | null, bound: Bindings): boolean {
    const root = bound.get(this.binding);
    if (value === null || root === undefined) {
      return false;
    }
    const path = NormalisedPath.of(value).value;
    if (!this.absolute(path)) {
      return false;
    }
    const folder = NormalisedPath.of(root).value.replace(/\/$/, "");
    return path !== folder && !path.startsWith(`${folder}/`);
  }

  private absolute(path: string): boolean {
    return path.startsWith("/") || /^[a-z]:\//.test(path);
  }
}
