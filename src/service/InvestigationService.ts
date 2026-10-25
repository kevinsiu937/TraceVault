import type { CapturePort } from "../capture/CapturePort.js";
import type { Event } from "../schema/Event.js";
import type { EventFactory } from "../schema/EventFactory.js";
import type { EventStorePort } from "../store/EventStorePort.js";
import { ActivityFilter } from "./ActivityFilter.js";
import type { InvestigationServicePort, RecordResult } from "./InvestigationServicePort.js";
import type { SessionActivity } from "./SessionActivity.js";
import type { SessionSummary } from "./SessionSummary.js";
import type { TimelineBuilder } from "./TimelineBuilder.js";
import type { TimelineEntry } from "./TimelineEntry.js";

const META_TYPES: ReadonlySet<Event["type"]> = new Set([
  "session.start",
  "session.end",
  "capture.gap",
  "capture.duplicate",
]);

export class InvestigationService implements InvestigationServicePort {
  private readonly listeners = new Map<string, Set<(entry: TimelineEntry) => void>>();

  constructor(
    private readonly capture: CapturePort,
    private readonly store: EventStorePort,
    private readonly factory: EventFactory,
    private readonly timeline: TimelineBuilder,
  ) {}

  recordHookPayload(raw: unknown, receivedAt: Date): RecordResult {
    let event: Event | null;
    try {
      event = this.capture.toEvent(raw, receivedAt);
    } catch {
      // An unreadable payload is a rejected capture, not a service failure.
      return "rejected";
    }
    if (event === null) {
      return "ignored";
    }

    if (!META_TYPES.has(event.type) && event.correlation_id !== null) {
      const previous = this.store.findByCorrelation(event.correlation_id);
      if (previous !== null) {
        this.store.append(event);
        this.store.append(
          this.factory.captureDuplicate(
            { sessionId: event.session_id, correlationId: event.correlation_id, receivedAt },
            previous.id,
          ),
        );
        return "stored";
      }
    }

    this.store.append(event);
    if (event.type !== "capture.duplicate") {
      this.publish(event);
    }
    return "stored";
  }

  listSessions(): SessionSummary[] {
    return this.store.listSessions().map((session) => ({
      sessionId: session.sessionId,
      title: session.title,
      agentName: session.agentName,
      startedAt: session.startedAt,
      endedAt: session.lastType === "session.end" ? session.lastAt : null,
      eventCount: session.eventCount,
    }));
  }

  hasSession(sessionId: string): boolean {
    return this.store.hasSession(sessionId);
  }

  getTimeline(sessionId: string, filter: ActivityFilter = ActivityFilter.none): TimelineEntry[] {
    const events = filter.active
      ? this.store.listMatching(filter.toQuery(sessionId))
      : this.store.listBySession(sessionId);
    return this.timeline.build(events);
  }

  listActivity(filter: ActivityFilter = ActivityFilter.none): SessionActivity[] {
    const sessions = new Map(this.store.listSessions().map((session) => [session.sessionId, session]));
    const grouped = new Map<string, Event[]>();

    for (const event of this.store.listMatching(filter.toQuery(null))) {
      const events = grouped.get(event.session_id) ?? [];
      events.push(event);
      grouped.set(event.session_id, events);
    }

    const activity: SessionActivity[] = [];
    for (const [sessionId, events] of grouped) {
      const entries = this.timeline.build(events);
      if (entries.length === 0) {
        continue;
      }
      const summary = sessions.get(sessionId);
      activity.push({
        sessionId,
        title: summary?.title ?? "",
        agentName: summary?.agentName ?? "",
        startedAt: summary?.startedAt ?? entries[0]?.time ?? "",
        entries,
      });
    }

    return activity.sort((left, right) => {
      const leftLast = left.entries[left.entries.length - 1]?.time ?? left.startedAt;
      const rightLast = right.entries[right.entries.length - 1]?.time ?? right.startedAt;
      return rightLast.localeCompare(leftLast) || right.sessionId.localeCompare(left.sessionId);
    });
  }

  subscribe(
    sessionId: string,
    listener: (entry: TimelineEntry) => void,
    filter: ActivityFilter = ActivityFilter.none,
  ): () => void {
    const listeners = this.listeners.get(sessionId) ?? new Set<(entry: TimelineEntry) => void>();
    const guarded = (entry: TimelineEntry): void => {
      if (filter.matches(entry)) {
        listener(entry);
      }
    };
    listeners.add(guarded);
    this.listeners.set(sessionId, listeners);
    return () => {
      listeners.delete(guarded);
      if (listeners.size === 0) {
        this.listeners.delete(sessionId);
      }
    };
  }

  private publish(event: Event): void {
    const listeners = this.listeners.get(event.session_id);
    if (listeners === undefined || listeners.size === 0) {
      return;
    }
    const entry = this.timeline.entry(event);
    for (const listener of listeners) {
      listener(entry);
    }
  }
}
