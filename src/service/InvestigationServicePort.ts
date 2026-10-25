import type { ActivityFilter } from "./ActivityFilter.js";
import type { SessionActivity } from "./SessionActivity.js";
import type { SessionSummary } from "./SessionSummary.js";
import type { TimelineEntry } from "./TimelineEntry.js";

export type RecordResult = "stored" | "ignored" | "rejected";

export interface InvestigationServicePort {
  recordHookPayload(raw: unknown, receivedAt: Date): RecordResult;
  listSessions(): SessionSummary[];
  hasSession(sessionId: string): boolean;
  getTimeline(sessionId: string, filter?: ActivityFilter): TimelineEntry[];
  listActivity(filter?: ActivityFilter): SessionActivity[];
  subscribe(
    sessionId: string,
    listener: (entry: TimelineEntry) => void,
    filter?: ActivityFilter,
  ): () => void;
}
