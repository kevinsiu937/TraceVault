import type { Event } from "../schema/Event.js";

/**
 * The events a reader should see once each: a duplicate observation record is
 * dropped, and of two records for the same call only the first is kept. The
 * timeline and the scanner both read through this, so they see the same session.
 */
export class DistinctEvents {
  /** `seen` carries the calls already kept, so a session can be read in parts. */
  of(events: readonly Event[], seen: Set<string> = new Set()): Event[] {
    const distinct: Event[] = [];

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
      distinct.push(event);
    }

    return distinct;
  }
}
