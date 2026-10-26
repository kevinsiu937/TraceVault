import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HookPayloadParser } from "../../src/capture/HookPayloadParser.js";
import { PayloadDigest } from "../../src/capture/PayloadDigest.js";
import { PluginHookCapture } from "../../src/capture/PluginHookCapture.js";
import { ToolClassifier } from "../../src/capture/ToolClassifier.js";
import { ActivityView } from "../../src/dashboard/ActivityView.js";
import { DashboardServer } from "../../src/dashboard/DashboardServer.js";
import { SessionListView } from "../../src/dashboard/SessionListView.js";
import { TimelineView } from "../../src/dashboard/TimelineView.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { ActivityFilter } from "../../src/service/ActivityFilter.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

const SESSION = "ses_live";

interface LivePayload {
  eventId: string;
  time: string;
  position: number;
  html: string;
}

function toolAfter(tool: string, args: Record<string, unknown>, callID: string): unknown {
  return {
    hook: "tool.execute.after",
    input: { tool, sessionID: SESSION, callID, args },
    output: { title: "t", metadata: { truncated: false } },
  };
}

const decoder = new TextDecoder();

async function collect(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  stop: (payloads: LivePayload[]) => boolean,
): Promise<LivePayload[]> {
  const payloads: LivePayload[] = [];
  let buffer = "";
  for (let attempt = 0; attempt < 20 && !stop(payloads); attempt += 1) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame.split("\n").find((line) => line.startsWith("data: "));
      if (data !== undefined) {
        payloads.push(JSON.parse(data.slice(6)));
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
  return payloads;
}

describe("seam A: live timeline updates", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-live-"));
    store = new SqliteEventStore(join(directory, "events.db"));
    const factory = new EventFactory();
    const capture = new PluginHookCapture(
      new HookPayloadParser(),
      new ToolClassifier(new PayloadDigest()),
      factory,
    );
    service = new InvestigationService(capture, store, factory, new TimelineBuilder());
    server = new DashboardServer(
      service,
      new SessionListView(),
      new TimelineView(),
      new ActivityView(),
    );
    baseUrl = `http://127.0.0.1:${await server.listen(0)}`;
  });

  afterEach(async () => {
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("sends the timeline position of an event that arrives out of order", async () => {
    service.recordHookPayload(toolAfter("read", { filePath: "later.ts" }, "call_later"), new Date("2026-10-25T10:00:10.000Z"));

    const controller = new AbortController();
    const stream = await fetch(`${baseUrl}/sessions/${SESSION}/events`, { signal: controller.signal });
    const reader = stream.body?.getReader();
    expect(reader).toBeDefined();

    service.recordHookPayload(toolAfter("read", { filePath: "earlier.ts" }, "call_earlier"), new Date("2026-10-25T10:00:00.000Z"));
    const earlierId = service.getTimeline(SESSION).find((entry) => entry.target === "earlier.ts")?.eventId;

    const payloads = await collect(
      reader as ReadableStreamDefaultReader<Uint8Array>,
      (received) => received.some((payload) => payload.eventId === earlierId),
    );
    controller.abort();

    const received = payloads.find((payload) => payload.eventId === earlierId);
    expect(received).toBeDefined();
    expect(received?.eventId).toBe(earlierId);
    expect(received?.position).toBe(0);
    expect(received?.time).toBe("2026-10-25T10:00:00.000Z");
  });

  it("agrees with the server-rendered order after a refresh", async () => {
    service.recordHookPayload(toolAfter("read", { filePath: "later.ts" }, "call_later"), new Date("2026-10-25T10:00:10.000Z"));

    const controller = new AbortController();
    const stream = await fetch(`${baseUrl}/sessions/${SESSION}/events`, { signal: controller.signal });
    const reader = stream.body?.getReader();
    expect(reader).toBeDefined();

    service.recordHookPayload(toolAfter("read", { filePath: "earlier.ts" }, "call_earlier"), new Date("2026-10-25T10:00:00.000Z"));
    const earlierId = service.getTimeline(SESSION).find((entry) => entry.target === "earlier.ts")?.eventId;

    const payloads = await collect(
      reader as ReadableStreamDefaultReader<Uint8Array>,
      (received) => received.some((payload) => payload.eventId === earlierId),
    );
    controller.abort();

    const position = payloads.find((payload) => payload.eventId === earlierId)?.position;
    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    const rows = [...body.matchAll(/<li class="event" data-event-id="([^"]+)" data-time="([^"]+)"/g)];

    expect(rows.map((match) => match[1])[position ?? -1]).toBe(earlierId);
    expect(rows.map((match) => match[2])).toEqual([
      "2026-10-25T10:00:00.000Z",
      "2026-10-25T10:00:10.000Z",
    ]);
    expect(rows.map((match) => match[1])).toEqual([
      earlierId,
      service.getTimeline(SESSION).find((entry) => entry.target === "later.ts")?.eventId,
    ]);
  });

  it("updates rows in place without a reload or a full re-render", async () => {
    service.recordHookPayload(toolAfter("read", { filePath: "a.ts" }, "call_a"), new Date("2026-10-25T10:00:00.000Z"));

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();

    expect(body).toContain("new EventSource");
    expect(body).not.toContain("location.reload");
    expect(body).not.toContain("timeline.innerHTML");
  });

  it("drops filtered-out events and positions the rest within the filtered timeline", async () => {
    service.recordHookPayload(toolAfter("bash", { command: "ls" }, "call_seeded"), new Date("2026-10-25T10:00:00.000Z"));
    service.recordHookPayload(toolAfter("read", { filePath: "seeded.ts" }, "call_seeded_read"), new Date("2026-10-25T10:00:05.000Z"));

    const controller = new AbortController();
    const stream = await fetch(`${baseUrl}/sessions/${SESSION}/events?kind=document.access`, { signal: controller.signal });
    const reader = stream.body?.getReader();
    expect(reader).toBeDefined();

    service.recordHookPayload(toolAfter("bash", { command: "echo skipped" }, "call_skipped"), new Date("2026-10-25T10:00:01.000Z"));
    service.recordHookPayload(toolAfter("read", { filePath: "live.ts" }, "call_live_read"), new Date("2026-10-25T10:00:02.000Z"));
    const liveId = service.getTimeline(SESSION).find((entry) => entry.target === "live.ts")?.eventId;

    const payloads = await collect(
      reader as ReadableStreamDefaultReader<Uint8Array>,
      (received) => received.some((payload) => payload.eventId === liveId),
    );
    controller.abort();

    expect(payloads.map((payload) => payload.eventId)).toEqual([liveId]);
    expect(payloads[0]?.position).toBe(0);
    const filtered = service.getTimeline(SESSION, new ActivityFilter(["document.access"], [], [], ""));
    expect(filtered.map((entry) => entry.target)).toEqual(["live.ts", "seeded.ts"]);
  });
});
