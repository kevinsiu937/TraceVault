import type { Severity } from "../../schema/Finding.js";
import type { DurationWindow } from "./DurationWindow.js";
import type { RuleStep } from "./RuleStep.js";

/** A loaded rule file. Its steps must match events in order, inside the window. */
export class Rule {
  constructor(
    readonly id: string,
    readonly version: number,
    readonly severity: Severity,
    /** A few plain words a reader with no IT background understands. */
    readonly title: string,
    readonly explanation: string,
    /** What the reader should do about a finding, written next to the explanation. */
    readonly recommendation: string,
    readonly steps: readonly [RuleStep, ...RuleStep[]],
    /** Null only for a rule that matches one event, where a window means nothing. */
    readonly window: DurationWindow | null,
    /** The opt-in guard may refuse a pending call that matches this rule. */
    readonly blockable: boolean = false,
  ) {}
}
