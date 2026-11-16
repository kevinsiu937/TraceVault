import type { Event } from "../schema/Event.js";
import type { CapturePath } from "../schema/CapturePath.js";
import type { EventQuery } from "./EventQuery.js";
import type { StoredArchiveRun } from "./StoredArchiveRun.js";
import type { StoredSession } from "./StoredSession.js";

export interface EventStorePort {
  append(event: Event): void;
  listBySession(sessionId: string): Event[];
  listMatching(query: EventQuery): Event[];
  hasSession(sessionId: string): boolean;
  hasEventOfType(sessionId: string, type: Event["type"], capturePath: CapturePath): boolean;
  listSessions(): StoredSession[];
  /** Every row in chain order: the event as read today, and as stored, which its hash covers. */
  listAllOrdered(): { rowId: number; event: Event; stored: Event; hash: string }[];
  findByCorrelation(correlationId: string): Event | null;
  /** Where the chain jumps over rows moved to another file: from one hash to the last hash of the rows moved. */
  listAnchors(): ReadonlyMap<string, string>;
  /** Whether the session was moved to an archive file. */
  isArchived(sessionId: string): boolean;
  /** Every archive run that moved something, newest first. */
  listArchiveRuns(): StoredArchiveRun[];
}
