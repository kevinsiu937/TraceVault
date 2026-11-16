import type { ActivityFilter } from "./ActivityFilter.js";
import type { SessionActivity } from "./SessionActivity.js";
import type { SessionSummary } from "./SessionSummary.js";
import type { TimelineEntry } from "./TimelineEntry.js";
import type { RuleChoice } from "./RuleHistoryPort.js";
import type { SessionView } from "./SessionView.js";

export type RecordResult = "stored" | "ignored" | "rejected";

export interface InvestigationServicePort {
  recordHookPayload(raw: unknown, receivedAt: Date): RecordResult;
  listSessions(): SessionSummary[];
  hasSession(sessionId: string): boolean;
  /** One session for a rule choice and a filter, or null when it does not exist. */
  getSession(sessionId: string, rules?: RuleChoice, filter?: ActivityFilter): SessionView | null;
  /** Entries carry the flags of findings over the whole session, whatever the filter. Kept for the live stream. */
  getTimeline(sessionId: string, filter?: ActivityFilter): TimelineEntry[];
  listActivity(filter?: ActivityFilter): SessionActivity[];
  /** Every new event in the session; the caller applies its own filter through getTimeline. */
  subscribe(sessionId: string, listener: (entry: TimelineEntry) => void): () => void;
}
