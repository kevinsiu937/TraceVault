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
    const unsubscribe = this.service.subscribe(
      sessionId,
      (entry) => {
        const payload = {
          eventId: entry.eventId,
          time: entry.time,
          html: this.view.renderEntry(entry),
        };
        response.write(`data: ${JSON.stringify(payload)}\n\n`);
      },
      filter,
    );
    request.on("close", () => {
      unsubscribe();
      response.end();
    });
  }
}
