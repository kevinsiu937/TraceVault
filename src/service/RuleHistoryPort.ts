import type { SessionConfiguration } from "./SessionConfiguration.js";
import type { SessionFindings } from "./SessionFindings.js";

/** Both scanners, built from one rule set. */
export interface RuleSetScanners {
  readonly findings: SessionFindings;
  readonly configuration: SessionConfiguration;
}

/** Which rules judged a session when it was recorded ("then"), as opposed to today's ("now"). */
export type RuleChoice = "now" | "then";

/** "same": then and now agree; "different": they do not; "unknown": the rules from then were not kept. */
export type RuleVersions = "same" | "different" | "unknown";

/** The rule sets kept over time. The composition root decides where they live and how scanners are rebuilt. */
export interface RuleHistoryPort {
  /** Records today's rule set as the one a new session started under. */
  recordSession(sessionId: string): void;
  /** The scanners of the rules a session was recorded under: "current" when those are today's, null when they were not kept. */
  then(sessionId: string): RuleSetScanners | "current" | null;
}
