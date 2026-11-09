import type { Rule } from "./Rule.js";

/** Every loaded rule, plus a digest of the files they came from. */
export class RuleSet {
  constructor(
    readonly rules: readonly Rule[],
    readonly digest: string,
  ) {}
}
