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
      const all = this.service.getTimeline(sessionId);
      const timeline = filter.active ? this.service.getTimeline(sessionId, filter) : all;
      const position = timeline.findIndex((candidate) => candidate.eventId === entry.eventId);
      // Absent from the shown timeline: filtered out, or a duplicate collapsed at read time.
      // It still sends the shown rows whose flags it changed.
      const current = timeline[position];
      if (current !== undefined) {
        sentFlags.set(current.eventId, current.flags.join(" "));
      }
      const changed = timeline.filter((candidate) => (sentFlags.get(candidate.eventId) ?? "") !== candidate.flags.join(" "));
      for (const candidate of changed) {
        sentFlags.set(candidate.eventId, candidate.flags.join(" "));
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
