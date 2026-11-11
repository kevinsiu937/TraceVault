import type { RuleSource } from "../../schema/ConfigFinding.js";
import type { Severity } from "../../schema/Finding.js";

/** The agent would make a call for this permission, for any one of these example targets, without asking. */
export interface AllowsCheck {
  readonly permission: string;
  readonly targets: readonly string[];
}

/** A loaded `rules/config/*.yaml` file. Every check must hold for an agent before it is flagged. */
export class ConfigRule {
  constructor(
    readonly id: string,
    readonly version: number,
    readonly severity: Severity,
    readonly explanation: string,
    readonly source: RuleSource,
    readonly checks: readonly [AllowsCheck, ...AllowsCheck[]],
  ) {}
}
