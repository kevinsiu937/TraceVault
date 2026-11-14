import type { Finding } from "../schema/Finding.js";
import type { ActivityFilter } from "../service/ActivityFilter.js";
import type { RuleChoice, RuleVersions } from "../service/RuleHistoryPort.js";
import type { SessionSummary } from "../service/SessionSummary.js";
import type { TimelineEntry } from "../service/TimelineEntry.js";
import type { SessionParams } from "./SessionParams.js";

/**
 * Everything a cockpit pane may read. Built once per request by DashboardServer,
 * so panes never touch the store or the service directly.
 */
export interface SessionRenderContext {
  readonly sessionId: string;
  readonly title: string;
  readonly summary: SessionSummary;
  readonly entries: readonly TimelineEntry[];
  readonly allEntries: readonly TimelineEntry[];
  readonly findings: readonly Finding[];
  /** Static findings on the configuration the session ran under. */
  readonly configFindingCount: number;
  /** Which rules the findings use, and whether the rules from when the session was recorded agree. */
  readonly rules: { readonly viewing: RuleChoice; readonly versions: RuleVersions };
  readonly filter: ActivityFilter;
  readonly state: SessionParams;
  readonly sessions: readonly SessionSummary[];
  readonly previousSessionId: string | null;
  readonly nextSessionId: string | null;
}
