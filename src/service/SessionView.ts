import type { ConfigFinding } from "../schema/ConfigFinding.js";
import type { Finding } from "../schema/Finding.js";
import type { ConfigurationSnapshot } from "./ConfigurationSnapshot.js";
import type { RuleVersions } from "./RuleHistoryPort.js";
import type { SessionSummary } from "./SessionSummary.js";
import type { TimelineEntry } from "./TimelineEntry.js";

/** Everything the session page, the configuration page and the report show of one session, read in one call. */
export interface SessionView {
  readonly summary: SessionSummary;
  /** The timeline as the filter shows it; `allEntries` when no filter is active. */
  readonly entries: readonly TimelineEntry[];
  readonly allEntries: readonly TimelineEntry[];
  readonly findings: readonly Finding[];
  /** The latest configuration recorded in the session, or null when none was. */
  readonly configuration: ConfigurationSnapshot | null;
  readonly configFindings: readonly ConfigFinding[];
  /** Whether the rules from when the session was recorded agree with today's. */
  readonly ruleVersions: RuleVersions;
  /** The sessions before and after it in the session list. */
  readonly previousSessionId: string | null;
  readonly nextSessionId: string | null;
  /** The subagent sessions it started. */
  readonly children: readonly SessionSummary[];
}
