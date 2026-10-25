import type { Event } from "../schema/Event.js";
import type { EventQuery } from "./EventQuery.js";
import type { StoredSession } from "./StoredSession.js";

export interface EventStorePort {
  append(event: Event): void;
  listBySession(sessionId: string): Event[];
  listMatching(query: EventQuery): Event[];
  hasSession(sessionId: string): boolean;
  listSessions(): StoredSession[];
  listAllOrdered(): { rowId: number; event: Event; hash: string }[];
  findByCorrelation(correlationId: string): Event | null;
}
