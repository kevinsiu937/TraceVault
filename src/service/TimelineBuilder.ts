import type { Event } from "../schema/Event.js";
import type { TimelineEntry } from "./TimelineEntry.js";

export class TimelineBuilder {
  build(events: readonly Event[]): TimelineEntry[] {
    const seen = new Set<string>();
    const entries: TimelineEntry[] = [];

    for (const event of events) {
      if (event.type === "capture.duplicate") {
        continue;
      }
      if (event.correlation_id !== null) {
        if (seen.has(event.correlation_id)) {
          continue;
        }
        seen.add(event.correlation_id);
      }
      entries.push(this.entry(event));
    }

    return entries;
  }

  entry(event: Event): TimelineEntry {
    return {
      eventId: event.id,
      type: event.type,
      target: this.target(event),
      outcome: this.outcome(event),
      time: event.timestamp,
      durationMs: event.duration_ms,
      operation: event.type === "document.access" ? event.data.operation : null,
      gapFrom: event.type === "capture.gap" ? event.data.from : null,
      gapTo: event.type === "capture.gap" ? event.data.to : null,
      detail: JSON.stringify(event, null, 2),
    };
  }

  private target(event: Event): string {
    switch (event.type) {
      case "document.access":
        return event.data.path;
      case "mcp.call":
        return `${event.data.server} · ${event.data.tool}`;
      case "skill.call":
        return event.data.skill;
      case "hook.script":
        return event.data.target;
      case "capture.gap":
        return event.data.reason;
      case "capture.duplicate":
        return event.data.of_event_id;
      case "prompt.user":
        return event.data.text;
      case "session.start":
      case "session.end":
        return "session";
    }
  }

  private outcome(event: Event): string {
    switch (event.type) {
      case "document.access":
      case "mcp.call":
      case "skill.call":
      case "hook.script":
        return event.data.outcome;
      case "capture.gap":
        return "gap";
      case "capture.duplicate":
        return "duplicate";
      case "prompt.user":
        return "prompt";
      case "session.start":
      case "session.end":
        return "boundary";
    }
  }
}
