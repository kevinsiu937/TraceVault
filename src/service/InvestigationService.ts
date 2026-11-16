import type { CapturePort } from "../capture/CapturePort.js";
import type { Event } from "../schema/Event.js";
import type { EventFactory } from "../schema/EventFactory.js";
import type { NetConnectData } from "../schema/NetConnectData.js";
import type { EventStorePort } from "../store/EventStorePort.js";
import type { McpTrustPort } from "../store/McpTrustPort.js";
import type { StoredSession } from "../store/StoredSession.js";
import { ActivityFilter } from "./ActivityFilter.js";
import type { ArchiveRun } from "./ArchiveRun.js";
import type { InvestigationServicePort, RecordResult } from "./InvestigationServicePort.js";
import type { SessionActivity } from "./SessionActivity.js";
import { SessionConfiguration } from "./SessionConfiguration.js";
import { SessionFindings } from "./SessionFindings.js";
import type { RuleChoice, RuleHistoryPort } from "./RuleHistoryPort.js";
import { SessionRules } from "./SessionRules.js";
import type { SessionSummary } from "./SessionSummary.js";
import type { SessionView } from "./SessionView.js";
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
    private readonly trust: McpTrustPort | null = null,
  ) {
    this.rules = new SessionRules({ findings, configuration }, history);
  }

  private readonly rules: SessionRules;

  recordHookPayload(raw: unknown, receivedAt: Date): RecordResult {
    let event: Event | null;
    // A store that fails while capture asks for the server names is a service failure, not a bad payload.
    let storeFailure: { readonly error: unknown } | null = null;
    try {
      event = this.capture.toEvent(raw, receivedAt, (sessionId) => {
        try {
          return this.mcpServers(sessionId);
        } catch (error) {
          storeFailure = { error };
          throw error;
        }
      });
    } catch {
      if (storeFailure !== null) {
        throw (storeFailure as { readonly error: unknown }).error;
      }
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

    this.keep(event);
    return "stored";
  }

  recordConnection(sessionId: string, data: NetConnectData, receivedAt: Date): void {
    this.keep(this.factory.netConnect({ sessionId, correlationId: null, receivedAt }, data));
  }

  private keep(event: Event): void {
    const first = !this.store.hasSession(event.session_id);
    this.store.append(event);
    if (first) {
      this.rules.remember(event.session_id);
    }
    if (event.type !== "capture.duplicate") {
      this.publish(event);
    }
  }

  /** The MCP server names in the session's latest recorded configuration. */
  private mcpServers(sessionId: string): string[] {
    const snapshots = this.store.listMatching({ sessionId, kinds: ["config.snapshot"], outcomes: [], operations: [], text: "" });
    const latest = snapshots[snapshots.length - 1];
    const mcp = latest?.type === "config.snapshot" ? latest.data.config["mcp"] : undefined;
    return typeof mcp === "object" && mcp !== null ? Object.keys(mcp) : [];
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

    return stored.map((session) => this.summary(session, activity.get(session.sessionId) ?? []));
  }

  listArchiveRuns(): ArchiveRun[] {
    return this.store.listArchiveRuns();
  }

  private summary(session: StoredSession,events: readonly Event[]): SessionSummary {
    const analysed = this.analyse(events.filter((event) => !META_TYPES.has(event.type)));
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

  getSession(sessionId: string, rules: RuleChoice = "now", filter: ActivityFilter = ActivityFilter.none): SessionView | null {
    const stored = this.store.listSessions();
    const index = stored.findIndex((session) => session.sessionId === sessionId);
    const own = stored[index];
    if (own === undefined) {
      return null;
    }
    const events = this.store.listBySession(sessionId);
    const scanners = this.rules.for(sessionId, rules);
    const allEntries = scanners.findings.flag(this.timeline.build(events), events);
    const known = this.store.listMatching({ sessionId: null, kinds: ["mcp.tools"], outcomes: [], operations: [], text: "" });
    const acceptances = this.trust?.list() ?? [];
    return {
      summary: this.summary(own, events),
      allEntries,
      entries: filter.active ? scanners.findings.flag(this.timeline.build(this.store.listMatching(filter.toQuery(sessionId))), events) : allEntries,
      findings: scanners.findings.of(events),
      configuration: this.configuration.latest(events, acceptances),
      configFindings: scanners.configuration.findings(events, known.filter((event) => event.type === "mcp.tools"), acceptances),
      ruleVersions: this.rules.versions(sessionId, events),
      previousSessionId: stored[index + 1]?.sessionId ?? null,
      nextSessionId: stored[index - 1]?.sessionId ?? null,
      children: stored
        .filter((session) => session.parentSessionId === sessionId)
        .map((session) => this.summary(session, this.store.listBySession(session.sessionId))),
    };
  }

  getTimeline(sessionId: string, filter: ActivityFilter = ActivityFilter.none): TimelineEntry[] {
    const session = this.store.listBySession(sessionId);
    const events = filter.active ? this.store.listMatching(filter.toQuery(sessionId)) : session;
    return this.rules.for(sessionId, "now").findings.flag(this.timeline.build(events), session);
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
