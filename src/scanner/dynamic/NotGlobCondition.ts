import type { Condition } from "./Condition.js";
import { GlobCondition } from "./GlobCondition.js";

/**
 * `{ not_glob: [patterns] }`: the fact is present and matches none of the
 * patterns, such as a host not on a list of known ones. A missing fact never
 * matches, so an event without it is not "unlisted".
 */
export class NotGlobCondition implements Condition {
  private constructor(private readonly listed: Condition) {}

  static parse(argument: unknown): Condition {
    return new NotGlobCondition(GlobCondition.parse(argument));
  }

  matches(value: string | null): boolean {
    return value !== null && !this.listed.matches(value, new Map());
  }
}
