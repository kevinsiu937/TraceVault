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
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

const SESSION = "ses_timeline";

function toolAfter(tool: string, args: Record<string, unknown>, callID: string, at: string, sessionID = SESSION): unknown {
  return {
    hook: "tool.execute.after",
    input: { tool, sessionID, callID, args },
    output: { title: "t", metadata: { truncated: false } },
  };
}

describe("seam A: session timeline page", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-timeline-"));
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

  it("shows one row per action, in timestamp order", async () => {
    service.recordHookPayload({ hook: "session.created", sessionID: SESSION }, new Date("2026-10-25T10:00:00.000Z"));
    service.recordHookPayload(toolAfter("read", { filePath: "a.ts" }, "call_a", "2026-10-25T10:00:01.000Z"), new Date("2026-10-25T10:00:01.000Z"));
    service.recordHookPayload(toolAfter("bash", { command: "ls" }, "call_b", "2026-10-25T10:00:02.000Z"), new Date("2026-10-25T10:00:02.000Z"));
    service.recordHookPayload(toolAfter("webfetch", { url: "https://example.com" }, "call_c", "2026-10-25T10:00:03.000Z"), new Date("2026-10-25T10:00:03.000Z"));

    const response = await fetch(`${baseUrl}/sessions/${SESSION}`);
    const body = await response.text();

    expect(response.status).toBe(200);
    const rows = [...body.matchAll(/<li class="event"[\s\S]*?<span class="target mono">([^<]*)<\/span>/g)];
    expect(rows.map((match) => match[1])).toEqual([
      "session",
      "a.ts",
      "ls",
      "https://example.com",
    ]);

    const kinds = [
      ...body.matchAll(/class="event" data-event-id="[^"]+" data-time="[^"]+" data-kind="([^"]+)"/g),
    ].map((match) => match[1]);
    expect(kinds).toEqual(["session.start", "document.access", "hook.script", "hook.script"]);
    expect(body).toContain('<span class="marker" data-kind="document.access"');
    expect(body).toContain("<details");
    expect(body).toContain('class="legend"');
    expect(body).toContain('class="legend-count">2<');
  });

  it("marks a failed action as an error and a duplicate observation only once", async () => {
    service.recordHookPayload({ hook: "tool.failed", input: { tool: "read", sessionID: SESSION, callID: "call_missing", args: { filePath: "missing.txt" } }, error: "File not found: missing.txt" }, new Date("2026-10-25T10:00:02.000Z"));
    service.recordHookPayload(toolAfter("read", { filePath: "a.ts" }, "call_a", "2026-10-25T10:00:03.000Z"), new Date("2026-10-25T10:00:03.000Z"));
    service.recordHookPayload(toolAfter("read", { filePath: "a.ts" }, "call_a", "2026-10-25T10:00:04.000Z"), new Date("2026-10-25T10:00:04.000Z"));

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();

    expect(body).toContain('class="pill error"');
    const rows = [...body.matchAll(/<li class="event"[\s\S]*?<span class="target mono">([^<]*)<\/span>/g)];
    expect(rows.filter((match) => match[1] === "a.ts")).toHaveLength(1);
  });

  it("renders a capture gap explicitly and streams a new event", async () => {
    service.recordHookPayload(
      { hook: "session.created", sessionID: SESSION },
      new Date("2026-10-25T10:00:00.000Z"),
    );
    service.recordHookPayload(
      {
        hook: "capture.gap",
        sessionID: SESSION,
        from: "2026-10-25T10:00:01.000Z",
        to: "2026-10-25T10:00:05.000Z",
        reason: "capture endpoint unavailable",
      },
      new Date("2026-10-25T10:00:05.000Z"),
    );

    const page = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    expect(page).toContain('class="pill gap"');
    expect(page).toContain("capture endpoint unavailable");
    expect(page).toContain("new EventSource");

    const controller = new AbortController();
    const stream = await fetch(`${baseUrl}/sessions/${SESSION}/events`, { signal: controller.signal });
    expect(stream.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const reader = stream.body?.getReader();
    expect(reader).toBeDefined();

    service.recordHookPayload(
      toolAfter("read", { filePath: "live.ts" }, "call_live", "2026-10-25T10:00:06.000Z"),
      new Date("2026-10-25T10:00:06.000Z"),
    );
    let text = "";
    for (let attempt = 0; attempt < 5 && !text.includes("live.ts"); attempt += 1) {
      const chunk = await reader?.read();
      if (chunk === undefined || chunk.done) {
        break;
      }
      text += new TextDecoder().decode(chunk.value);
    }
    controller.abort();
    expect(text).toContain("live.ts");
  });

  it("keeps two interleaved sessions separate in the list and in each timeline", async () => {
    const other = "ses_other";
    service.recordHookPayload({ hook: "session.created", sessionID: SESSION }, new Date("2026-10-25T10:00:00.000Z"));
    service.recordHookPayload({ hook: "session.created", sessionID: other }, new Date("2026-10-25T10:00:00.500Z"));
    service.recordHookPayload(toolAfter("read", { filePath: "only-main.ts" }, "call_m1", "2026-10-25T10:00:01.000Z"), new Date("2026-10-25T10:00:01.000Z"));
    service.recordHookPayload(toolAfter("read", { filePath: "only-other.ts" }, "call_o1", "2026-10-25T10:00:01.500Z", other), new Date("2026-10-25T10:00:01.500Z"));

    const list = await (await fetch(`${baseUrl}/`)).text();
    expect(list).toContain(SESSION);
    expect(list).toContain(other);

    const mainPage = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    const otherPage = await (await fetch(`${baseUrl}/sessions/${other}`)).text();
    expect(mainPage).toContain("only-main.ts");
    expect(mainPage).not.toContain("only-other.ts");
    expect(otherPage).toContain("only-other.ts");
    expect(otherPage).not.toContain("only-main.ts");
  });

  it("separates error and denied rows from success at a glance", async () => {
    service.recordHookPayload(
      { hook: "tool.failed", input: { tool: "read", sessionID: SESSION, callID: "call_err", args: { filePath: "err.ts" } }, error: "File not found" },
      new Date("2026-10-25T10:00:10.000Z"),
    );
    service.recordHookPayload(
      { hook: "tool.failed", input: { tool: "read", sessionID: SESSION, callID: "call_denied", args: { filePath: "denied.ts" } }, error: "The user rejected permission to use this specific tool call" },
      new Date("2026-10-25T10:00:11.000Z"),
    );
    service.recordHookPayload(
      toolAfter("read", { filePath: "ok.ts" }, "call_ok"),
      new Date("2026-10-25T10:00:12.000Z"),
    );

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();

    expect(body).toContain('data-kind="document.access" data-outcome="error"');
    expect(body).toContain('data-kind="document.access" data-outcome="denied"');
    expect(body).toContain('class="pill error"');
    expect(body).toContain('class="pill denied"');
    expect(body).toContain('class="pill ok"');
  });

  it("expands a row in place to show the stored event detail", async () => {
    service.recordHookPayload(
      toolAfter("bash", { command: "echo detail" }, "call_detail"),
      new Date("2026-10-25T10:00:20.000Z"),
    );

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();

    expect(body).toContain("<summary");
    expect(body).toContain('class="event-detail"');
    expect(body).toContain("echo detail");
    expect(body).toContain("plugin_hook");
  });

  it("renders a thousand events in one page without dropping any", async () => {
    const base = Date.parse("2026-10-25T12:00:00.000Z");
    for (let index = 0; index < 1000; index += 1) {
      service.recordHookPayload(
        toolAfter("read", { filePath: `bulk/file-${index}.ts` }, `call_bulk_${index}`),
        new Date(base + index * 10),
      );
    }

    const start = performance.now();
    const response = await fetch(`${baseUrl}/sessions/${SESSION}`);
    const body = await response.text();
    const elapsed = performance.now() - start;

    expect(response.status).toBe(200);
    expect((body.match(/class="event" data-event-id="/g) ?? []).length).toBe(1000);
    expect(elapsed).toBeLessThan(2000);
  });

  it("returns 404 for a session with no events", async () => {
    expect((await fetch(`${baseUrl}/sessions/ses_absent`)).status).toBe(404);
  });
});
