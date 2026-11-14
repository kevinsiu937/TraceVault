import type { CapturePort } from "../capture/CapturePort.js";
import type { Event } from "../schema/Event.js";
import type { EventFactory } from "../schema/EventFactory.js";
import type { Finding } from "../schema/Finding.js";
import type { EventStorePort } from "../store/EventStorePort.js";
import { ActivityFilter } from "./ActivityFilter.js";
import type { ConfigFinding } from "../schema/ConfigFinding.js";
import type { ConfigurationSnapshot } from "./ConfigurationSnapshot.js";
import type { InvestigationServicePort, RecordResult } from "./InvestigationServicePort.js";
import type { SessionActivity } from "./SessionActivity.js";
import { SessionConfiguration } from "./SessionConfiguration.js";
import { SessionFindings } from "./SessionFindings.js";
import type { RuleChoice, RuleHistoryPort, RuleVersions } from "./RuleHistoryPort.js";
import { SessionRules } from "./SessionRules.js";
import type { SessionSummary } from "./SessionSummary.js";
import type { TimelineBuilder } from "./TimelineBuilder.js";
import type { TimelineEntry } from "./TimelineEntry.js";

const META_TYPES: ReadonlySet<Event["type"]> = new Set([
  "session.start",
  "session.end",
  "capture.gap",
  "capture.duplicate",
  "guard.failure",
  "config.snapshot",
  "mcp.tools",
]);

export class InvestigationService implements InvestigationServicePort {
  private readonly listeners = new Map<string, Set<(entry: TimelineEntry) => void>>();

  constructor(
    private readonly capture: CapturePort,
    private readonly store: EventStorePort,
    private readonly factory: EventFactory,
    private readonly timeline: TimelineBuilder,
    private readonly findings: SessionFindings = new SessionFindings(),
    private readonly configuration: SessionConfiguration = new SessionConfiguration(),
    history: RuleHistoryPort | null = null,
  ) {
    this.rules = new SessionRules({ findings, configuration }, history);
  }

  private readonly rules: SessionRules;

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

    const first = !this.store.hasSession(event.session_id);
    this.store.append(event);
    if (first) {
      this.rules.remember(event.session_id);
    }
    if (event.type !== "capture.duplicate") {
      this.publish(event);
    }
    return "stored";
  }

  listSessions(): SessionSummary[] {
    const stored = this.store.listSessions();
    const activity = new Map<string, Event[]>();
    // shortcut: this scans every event on each list page load; index activity by session+timestamp once sessions reach the thousands.
    for (const { event } of this.store.listAllOrdered()) {
      if (META_TYPES.has(event.type)) {
        continue;
      }
      const events = activity.get(event.session_id);
      if (events === undefined) {
        activity.set(event.session_id, [event]);
      } else {
        events.push(event);
      }
    }

    return stored.map((session) => {
      const analysed = this.analyse(activity.get(session.sessionId) ?? []);
      return {
        sessionId: session.sessionId,
        parentSessionId: session.parentSessionId,
        title: session.title,
        agentName: session.agentName,
        startedAt: session.startedAt,
        lastActivityAt: session.lastAt,
        endedAt: session.lastType === "session.end" ? session.lastAt : null,
        eventCount: session.eventCount,
        gapCount: session.gapCount,
        filesTouched: session.filesTouched,
        errorCount: session.errorCount,
        deniedCount: session.deniedCount,
        lastOutcome: session.lastOutcome,
        density: analysed.density,
        durationMs: analysed.durationMs,
      };
    });
  }

  private analyse(events: readonly Event[]): { density: number[]; durationMs: number | null } {
    const density = new Array<number>(12).fill(0);
    const times = events
      .map((event) => Date.parse(event.timestamp))
      .filter((time) => Number.isFinite(time));
    if (times.length === 0) {
      return { density, durationMs: null };
    }

    const first = Math.min(...times);
    const last = Math.max(...times);
    const span = last - first;
    for (const time of times) {
      const index = span === 0 ? 0 : Math.min(11, Math.floor(((time - first) / span) * 12));
      density[index] = (density[index] ?? 0) + 1;
    }
    return { density, durationMs: times.length >= 2 ? span : null };
  }

  hasSession(sessionId: string): boolean {
    return this.store.hasSession(sessionId);
  }

  getTimeline(sessionId: string, filter: ActivityFilter = ActivityFilter.none, rules: RuleChoice = "now"): TimelineEntry[] {
    const session = this.store.listBySession(sessionId);
    const events = filter.active ? this.store.listMatching(filter.toQuery(sessionId)) : session;
    return this.rules.for(sessionId, rules).findings.flag(this.timeline.build(events), session);
  }

  getFindings(sessionId: string, rules: RuleChoice = "now"): Finding[] {
    return this.rules.for(sessionId, rules).findings.of(this.store.listBySession(sessionId));
  }

  getRuleVersions(sessionId: string): RuleVersions {
    return this.rules.versions(sessionId, this.store.listBySession(sessionId));
  }

  getConfiguration(sessionId: string): ConfigurationSnapshot | null {
    return this.configuration.latest(this.store.listBySession(sessionId));
  }

  getConfigFindings(sessionId: string, rules: RuleChoice = "now"): ConfigFinding[] {
    const known = this.store.listMatching({ sessionId: null, kinds: ["mcp.tools"], outcomes: [], operations: [], text: "" });
    return this.rules.for(sessionId, rules).configuration.findings(
      this.store.listBySession(sessionId),
      known.filter((event) => event.type === "mcp.tools"),
    );
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

  subscribe(sessionId: string, listener: (entry: TimelineEntry) => void): () => void {
    const listeners = this.listeners.get(sessionId) ?? new Set<(entry: TimelineEntry) => void>();
    listeners.add(listener);
    this.listeners.set(sessionId, listeners);
    return () => {
      listeners.delete(listener);
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
