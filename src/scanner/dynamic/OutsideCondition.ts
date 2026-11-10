import type { Bindings, Condition } from "./Condition.js";
import { NormalisedPath } from "./NormalisedPath.js";

/**
 * `{ outside: name }`: the fact is a path that is not the folder an earlier
 * step bound as `name`, nor anything under it. A relative path is relative to
 * that folder, so it is outside only when `..` climbs out of it.
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
    const folder = NormalisedPath.of(root).value.replace(/\/$/, "");
    const given = NormalisedPath.of(value).value;
    const path = this.absolute(given) ? given : NormalisedPath.of(`${folder}/${given}`).value;
    return path !== folder && !path.startsWith(`${folder}/`);
  }

  private absolute(path: string): boolean {
    return path.startsWith("/") || /^[a-z]:\//.test(path);
  }
}
