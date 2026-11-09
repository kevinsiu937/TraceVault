import type { IncomingMessage, ServerResponse } from "node:http";

import type { ActivityFilter } from "../service/ActivityFilter.js";
import type { InvestigationServicePort } from "../service/InvestigationServicePort.js";
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
    // The flags each row was last sent with, so a row is re-sent only when its flags change.
    const sentFlags = new Map(
      this.service.getTimeline(sessionId, filter).map((entry) => [entry.eventId, entry.flags.join(" ")]),
    );
    const unsubscribe = this.service.subscribe(sessionId, (entry) => {
      // shortcut: one full timeline lookup per live event (O(n) per event); batch or index if a session ever streams thousands of events a second.
      const timeline = this.service.getTimeline(sessionId, filter);
      const position = timeline.findIndex((candidate) => candidate.eventId === entry.eventId);
      // Absent from the filtered timeline: filtered out, or a duplicate collapsed at read time.
      const current = timeline[position];
      if (current === undefined) {
        return;
      }
      sentFlags.set(current.eventId, current.flags.join(" "));
      const updates = timeline
        .filter((candidate) => (sentFlags.get(candidate.eventId) ?? "") !== candidate.flags.join(" "))
        .map((candidate) => {
          sentFlags.set(candidate.eventId, candidate.flags.join(" "));
          return { eventId: candidate.eventId, html: this.view.renderEntry(candidate) };
        });
      const payload = {
        eventId: current.eventId,
        time: current.time,
        position,
        html: this.view.renderEntry(current),
        updates,
      };
      response.write(`data: ${JSON.stringify(payload)}\n\n`);
    });
    request.on("close", () => {
      unsubscribe();
      response.end();
    });
  }
}
