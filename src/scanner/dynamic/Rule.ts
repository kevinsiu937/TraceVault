import type { Severity } from "../../schema/Finding.js";
import type { DurationWindow } from "./DurationWindow.js";
import type { RuleStep } from "./RuleStep.js";

/** A loaded rule file. Its steps must match events in order, inside the window. */
export class Rule {
  constructor(
    readonly id: string,
    readonly version: number,
    readonly severity: Severity,
    readonly explanation: string,
    readonly steps: readonly [RuleStep, ...RuleStep[]],
    /** Null only for a rule that matches one event, where a window means nothing. */
    readonly window: DurationWindow | null,
  ) {}
}
