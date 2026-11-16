import type { Event } from "../schema/Event.js";
import { EventFacts } from "../schema/EventFacts.js";
import { DistinctEvents } from "./DistinctEvents.js";
import type { TimelineEntry } from "./TimelineEntry.js";

export class TimelineBuilder {
  constructor(private readonly distinct: DistinctEvents = new DistinctEvents()) {}

  /** A connection whose bash call is among the rows follows that call, however early it happened: the call is recorded when it ends. */
  build(events: readonly Event[]): TimelineEntry[] {
    const rows = this.distinct.of(events).filter((event) => this.isRow(event));
    const calls = new Map(rows.filter((event) => event.type === "hook.script" && event.correlation_id !== null).map((event) => [event.correlation_id, event.id]));
    const nested = new Map<string, TimelineEntry[]>();
    const top: TimelineEntry[] = [];
    for (const event of rows) {
      const parent = event.type === "net.connect" && event.data.call_id !== null ? calls.get(event.data.call_id) : undefined;
      if (parent === undefined) {
        top.push(this.entry(event));
      } else {
        nested.set(parent, [...(nested.get(parent) ?? []), { ...this.entry(event), parentEventId: parent }]);
      }
    }
    return top.flatMap((entry) => [entry, ...(nested.get(entry.eventId) ?? [])]);
  }

  /** A configuration snapshot and an MCP tool list belong to the Configuration view, not to the timeline. */
  isRow(event: Event): boolean {
    return event.type !== "config.snapshot" && event.type !== "mcp.tools";
  }

  entry(event: Event): TimelineEntry {
    const facts = EventFacts.of(event);
    return {
      eventId: event.id,
      type: event.type,
      target: facts.target,
      outcome: facts.outcome,
      time: event.timestamp,
      durationMs: event.duration_ms,
      operation: facts.operation,
      isCall: facts.isCall,
      isHarnessPrompt: facts.isHarnessPrompt,
      gapFrom: event.type === "capture.gap" ? event.data.from : null,
      gapTo: event.type === "capture.gap" ? event.data.to : null,
      detail: JSON.stringify(event, null, 2),
      flags: [],
      parentEventId: null,
      blockedBy: "blocked_by" in event.data && typeof event.data.blocked_by === "string" ? event.data.blocked_by : null,
    };
  }
}
