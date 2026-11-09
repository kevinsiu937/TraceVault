export type Severity = "low" | "medium" | "high";

/**
 * A rule matched. This is a read model, computed from stored events and never
 * stored itself: it always resolves to a rule and the events that satisfied it.
 */
export interface Finding {
  readonly ruleId: string;
  readonly ruleVersion: number;
  /** Which rule set produced this finding, so a rule edit is visible rather than silent. */
  readonly ruleSetDigest: string;
  readonly severity: Severity;
  readonly explanation: string;
  readonly eventIds: readonly string[];
  /** Labels of the alternatives that matched, in step order, e.g. "shell egress". */
  readonly matched: readonly string[];
}
