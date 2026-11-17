import type { IncomingMessage, ServerResponse } from "node:http";

import type { ActivityFilter } from "../service/ActivityFilter.js";
import type { InvestigationServicePort } from "../service/InvestigationServicePort.js";
import type { TimelineEntry } from "../service/TimelineEntry.js";
import type { TimelineView } from "./TimelineView.js";

export class EventStream {
  constructor(
    private readonly service: InvestigationServicePort,
    private readonly view: TimelineView,
  ) {}

  open(
    sessionId: string,
    filter: ActivityFilter,
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    response.write(":\n\n");
    // The flags and parent each row was last sent with, so a row is re-sent only when either changes:
    // a connection streams before its bash call completes, and nests under it once the call arrives.
    const shownState = (entry: TimelineEntry): string => `${entry.flags.join(" ")}|${entry.parentEventId ?? ""}`;
    const sentState = new Map(this.service.getTimeline(sessionId, filter).map((entry) => [entry.eventId, shownState(entry)]));
    const unsubscribe = this.service.subscribe(sessionId, (entry) => {
      // shortcut: one full timeline lookup per live event (O(n) per event); batch or index if a session ever streams thousands of events a second.
      const all = this.service.getTimeline(sessionId);
      const timeline = filter.active ? this.service.getTimeline(sessionId, filter) : all;
      const position = timeline.findIndex((candidate) => candidate.eventId === entry.eventId);
      // Absent from the shown timeline: filtered out, or a duplicate collapsed at read time.
      // It still sends the shown rows whose flags or parent it changed.
      const current = timeline[position];
      if (current !== undefined) {
        sentState.set(current.eventId, shownState(current));
      }
      const changed = timeline.filter((candidate) => (sentState.get(candidate.eventId) ?? "|") !== shownState(candidate));
      for (const candidate of changed) {
        sentState.set(candidate.eventId, shownState(candidate));
      }
      if (current === undefined && changed.length === 0) {
        return;
      }
      const updates = this.view.renderUpdates(changed, all, timeline, filter.active);
      const payload =
        current === undefined
          ? { eventId: null, time: null, position: null, html: null, updates }
          : { eventId: current.eventId, time: current.time, position, html: this.view.renderEntry(current), updates };
      response.write(`data: ${JSON.stringify(payload)}\n\n`);
    });
    request.on("close", () => {
      unsubscribe();
      response.end();
    });
  }
}
