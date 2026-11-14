import type { ConfigFinding } from "../schema/ConfigFinding.js";
import type { Finding } from "../schema/Finding.js";
import type { ConfigurationSnapshot } from "./ConfigurationSnapshot.js";
import type { ActivityFilter } from "./ActivityFilter.js";
import type { SessionActivity } from "./SessionActivity.js";
import type { SessionSummary } from "./SessionSummary.js";
import type { TimelineEntry } from "./TimelineEntry.js";
import type { RuleChoice, RuleVersions } from "./RuleHistoryPort.js";

export type RecordResult = "stored" | "ignored" | "rejected";

export interface InvestigationServicePort {
  recordHookPayload(raw: unknown, receivedAt: Date): RecordResult;
  listSessions(): SessionSummary[];
  hasSession(sessionId: string): boolean;
  /** Entries carry the flags of findings over the whole session, whatever the filter. */
  getTimeline(sessionId: string, filter?: ActivityFilter, rules?: RuleChoice): TimelineEntry[];
  /** Every rule match in the session, computed from its events and never stored. */
  getFindings(sessionId: string, rules?: RuleChoice): Finding[];
  /** Whether the rules from when the session was recorded agree with today's. */
  getRuleVersions(sessionId: string): RuleVersions;
  /** The latest configuration recorded in the session, or null when none was. */
  getConfiguration(sessionId: string): ConfigurationSnapshot | null;
  /** Static rule matches on that configuration, computed on every read and never stored. */
  getConfigFindings(sessionId: string, rules?: RuleChoice): ConfigFinding[];
  listActivity(filter?: ActivityFilter): SessionActivity[];
  /** Every new event in the session; the caller applies its own filter through getTimeline. */
  subscribe(sessionId: string, listener: (entry: TimelineEntry) => void): () => void;
}
