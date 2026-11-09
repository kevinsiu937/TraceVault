import type { Event } from "../schema/Event.js";
import { EventFacts } from "../schema/EventFacts.js";
import { DistinctEvents } from "./DistinctEvents.js";
import type { TimelineEntry } from "./TimelineEntry.js";

export class TimelineBuilder {
  constructor(private readonly distinct: DistinctEvents = new DistinctEvents()) {}

  build(events: readonly Event[]): TimelineEntry[] {
    return this.distinct.of(events).map((event) => this.entry(event));
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
    };
  }
}
