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
import { DetailPaneView } from "../../src/dashboard/DetailPaneView.js";
import { SessionHeaderView } from "../../src/dashboard/SessionHeaderView.js";
import { SessionListView } from "../../src/dashboard/SessionListView.js";
import { SessionPageView } from "../../src/dashboard/SessionPageView.js";
import { SessionRailView } from "../../src/dashboard/SessionRailView.js";
import { TimelineView } from "../../src/dashboard/TimelineView.js";
import { WaterfallView } from "../../src/dashboard/WaterfallView.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

const SESSION = "ses_waterfall";
const DENIAL = "The user rejected permission to use this specific tool call";

function toolAfter(
  tool: string,
  args: Record<string, unknown>,
  callID: string,
  sessionID = SESSION,
  durationMs?: number,
): Record<string, unknown> {
  return {
    hook: "tool.execute.after",
    input: { tool, sessionID, callID, args },
    output: { title: "t", metadata: { truncated: false } },
    ...(durationMs === undefined ? {} : { durationMs }),
  };
}

function toolFailed(
  tool: string,
  args: Record<string, unknown>,
  callID: string,
  error: string,
): Record<string, unknown> {
  return { hook: "tool.failed", input: { tool, sessionID: SESSION, callID, args }, error };
}

function barTags(body: string): string[] {
  return [...body.matchAll(/<a class="[^"]*wf-bar[^"]*"[^>]*>/g)].map((match) => match[0]);
}

describe("seam A: the waterfall view", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-waterfall-"));
    store = new SqliteEventStore(join(directory, "events.db"));
    const factory = new EventFactory();
    const capture = new PluginHookCapture(
      new HookPayloadParser(),
      new ToolClassifier(new PayloadDigest()),
      factory,
    );
    service = new InvestigationService(capture, store, factory, new TimelineBuilder());
    const timelineView = new TimelineView();
    server = new DashboardServer(
      service,
      new SessionListView(),
      timelineView,
      new ActivityView(),
      undefined,
      new SessionPageView(
        new SessionHeaderView(),
        [new SessionRailView(), timelineView, new WaterfallView()],
        new DetailPaneView(),
      ),
    );
    baseUrl = `http://127.0.0.1:${await server.listen(0)}`;
  });

  afterEach(async () => {
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function seedThree(): void {
    service.recordHookPayload(
      toolAfter("read", { filePath: "a.ts" }, "call_a", SESSION, 2000),
      new Date("2026-10-25T10:00:00.000Z"),
    );
    service.recordHookPayload(
      toolAfter("read", { filePath: "b.ts" }, "call_b"),
      new Date("2026-10-25T10:00:05.000Z"),
    );
    service.recordHookPayload(
      toolAfter("bash", { command: "echo c" }, "call_c", SESSION, 500),
      new Date("2026-10-25T10:00:20.000Z"),
    );
  }

  it("switches the centre pane to the waterfall and drops the list rows", async () => {
    seedThree();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?view=waterfall`)).text();

    expect(body).toContain('aria-current="true">Waterfall</a>');
    expect(barTags(body)).toHaveLength(3);
    expect(body).not.toContain('class="event-row');
    expect((body.match(/class="wf-tick"/g) ?? []).length).toBe(5);
    expect(body).toContain(">10:00:00<");
    expect(body).toContain(">10:00:20<");
  });

  it("keeps the list view when it is selected", async () => {
    seedThree();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?view=list`)).text();

    expect(body).toContain('class="event-row');
    expect(body).not.toContain('class="wf-bar');
  });

  it("places and sizes bars from the wall-clock times and durations", async () => {
    seedThree();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?view=waterfall`)).text();
    const bars = barTags(body);

    // t0 = 10:00:00.000, t1 = 10:00:20.000 + 500ms => span = 20500ms.
    // a.ts: left 0, duration 2000 => width 2000/20500 = 9.76%
    expect(bars[0]).toContain('data-left="0.00"');
    expect(bars[0]).toContain('data-width="9.76"');
    // b.ts: left 5000 => 24.39%, duration 15000 (to next event) => 73.17%
    expect(bars[1]).toContain('data-left="24.39"');
    expect(bars[1]).toContain('data-width="73.17"');
    // echo c: left 20000 => 97.56%, width max(2, 500/20500 = 2.44%) => 2.44%
    expect(bars[2]).toContain('data-left="97.56"');
    expect(bars[2]).toContain('data-width="2.44"');
  });

  it("rings errors solid and denials dashed without marking clean bars", async () => {
    service.recordHookPayload(
      toolFailed("read", { filePath: "err.ts" }, "call_err", "File not found"),
      new Date("2026-10-25T10:00:00.000Z"),
    );
    service.recordHookPayload(
      toolFailed("read", { filePath: "denied.ts" }, "call_denied", DENIAL),
      new Date("2026-10-25T10:00:01.000Z"),
    );
    service.recordHookPayload(
      toolAfter("read", { filePath: "ok.ts" }, "call_ok"),
      new Date("2026-10-25T10:00:02.000Z"),
    );

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?view=waterfall`)).text();
    const bars = barTags(body);
    const errorBar = bars.find((tag) => tag.includes("err.ts"));
    const deniedBar = bars.find((tag) => tag.includes("denied.ts"));
    const cleanBar = bars.find((tag) => tag.includes("ok.ts"));

    expect(errorBar).toContain("wf-ring-error");
    expect(deniedBar).toContain("wf-ring-denied");
    expect(cleanBar).not.toContain("wf-ring-error");
    expect(cleanBar).not.toContain("wf-ring-denied");
  });

  it("renders a capture gap as a hatched band from the stored JSON window", async () => {
    service.recordHookPayload(
      { hook: "session.created", sessionID: SESSION, title: "Gaps" },
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
    service.recordHookPayload(
      toolAfter("read", { filePath: "after.ts" }, "call_after"),
      new Date("2026-10-25T10:00:06.000Z"),
    );

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?view=waterfall`)).text();
    const gap = body.match(/<a class="wf-gap[^"]*"[^>]*>/)?.[0] ?? "";

    expect(gap).toContain('data-from="2026-10-25T10:00:01.000Z"');
    expect(gap).toContain('data-to="2026-10-25T10:00:05.000Z"');
    expect(body).toContain("capture endpoint unavailable");
    expect(body).toContain("repeating-linear-gradient");
  });

  it("marks the selected event's bar as current", async () => {
    seedThree();
    const selected = service.getTimeline(SESSION).find((entry) => entry.target === "a.ts");
    const eventId = selected?.eventId ?? "";

    const body = await (
      await fetch(
        `${baseUrl}/sessions/${SESSION}?view=waterfall&event=${encodeURIComponent(eventId)}`,
      )
    ).text();
    const selectedBar = barTags(body).find((tag) => tag.includes(`data-event-id="${eventId}"`));

    expect(selectedBar).toBeDefined();
    expect(selectedBar).toContain('aria-current="true"');
    expect(body).toContain("wf-bar selected");
  });

  it("keeps a calm empty state when nothing is plotted", async () => {
    seedThree();

    const body = await (
      await fetch(`${baseUrl}/sessions/${SESSION}?view=waterfall&kind=mcp.call`)
    ).text();

    expect(barTags(body)).toHaveLength(0);
    expect(body).toContain("No events to plot in this session.");
  });
});
