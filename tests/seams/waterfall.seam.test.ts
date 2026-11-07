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

  it("zooms the axis to a selected time range and plots only the events inside it", async () => {
    seedThree();

    const body = await (
      await fetch(
        `${baseUrl}/sessions/${SESSION}?view=waterfall&from=2026-10-25T10:00:04.000Z&to=2026-10-25T10:00:24.000Z`,
      )
    ).text();
    const bars = barTags(body);

    // Window 10:00:04 → 10:00:24 is 20000ms; a.ts at 10:00:00 falls outside it.
    expect(bars).toHaveLength(2);
    expect(body).not.toContain("a.ts");
    expect(body).toContain(">10:00:04<");
    expect(body).toContain(">10:00:24<");
    // b.ts: left (5000-4000)/20000 = 5%, width 15000/20000 = 75% (to next event)
    expect(bars[0]).toContain('data-left="5.00"');
    expect(bars[0]).toContain('data-width="75.00"');
    // echo c: left 16000/20000 = 80%, width max(2, 500/20000 = 2.5%)
    expect(bars[1]).toContain('data-left="80.00"');
    expect(bars[1]).toContain('data-width="2.50"');
  });

  it("filters the list to the events inside a selected time range", async () => {
    seedThree();

    const body = await (
      await fetch(
        `${baseUrl}/sessions/${SESSION}?from=2026-10-25T10:00:04.000Z&to=2026-10-25T10:00:24.000Z`,
      )
    ).text();

    expect(body).toContain('class="event-row');
    expect(body).not.toContain("a.ts");
    expect(body).toContain("b.ts");
    expect(body).toContain("echo c");
    expect(body).toContain("2 of 3 events");
  });

  it("keeps the time range when another filter chip is toggled", async () => {
    seedThree();

    const body = await (
      await fetch(
        `${baseUrl}/sessions/${SESSION}?from=2026-10-25T10:00:04.000Z&to=2026-10-25T10:00:24.000Z`,
      )
    ).text();
    const errorChip = body.match(/<a class="chip[^"]*" href="([^"]*outcome=error[^"]*)"/)?.[1] ?? "";

    expect(errorChip).toContain("from=2026-10-25T10%3A00%3A04.000Z");
    expect(errorChip).toContain("to=2026-10-25T10%3A00%3A24.000Z");
  });

  it("offers a reset that returns the waterfall to the whole session", async () => {
    seedThree();

    const zoomed = await (
      await fetch(
        `${baseUrl}/sessions/${SESSION}?view=waterfall&from=2026-10-25T10:00:04.000Z&to=2026-10-25T10:00:24.000Z`,
      )
    ).text();
    const reset = zoomed.match(/<a class="wf-reset" href="([^"]*)"/)?.[1]?.replace(/&amp;/g, "&") ?? "";

    expect(reset).toContain("view=waterfall");
    expect(reset).not.toContain("from=");
    expect(reset).not.toContain("to=");

    const full = await (await fetch(`${baseUrl}${reset}`)).text();
    expect(barTags(full)).toHaveLength(3);
    expect(full).not.toContain('class="wf-reset"');
  });

  it("ignores a time range it cannot read", async () => {
    seedThree();

    const body = await (
      await fetch(`${baseUrl}/sessions/${SESSION}?view=waterfall&from=yesterday&to=2026-10-25T10:00:24.000Z`)
    ).text();

    expect(barTags(body)).toHaveLength(3);
    expect(body).not.toContain('class="wf-reset"');
  });

  it("says so when a selected time range holds no events", async () => {
    seedThree();

    const body = await (
      await fetch(
        `${baseUrl}/sessions/${SESSION}?view=waterfall&from=2026-10-25T10:00:01.000Z&to=2026-10-25T10:00:02.000Z`,
      )
    ).text();

    expect(barTags(body)).toHaveLength(0);
    expect(body).toContain("No events in this time range.");
    expect(body).toContain('class="wf-reset"');
  });

  it("keeps a calm empty state when nothing is plotted", async () => {
    seedThree();

    const body = await (
      await fetch(`${baseUrl}/sessions/${SESSION}?view=waterfall&kind=mcp.call`)
    ).text();

    expect(barTags(body)).toHaveLength(0);
    expect(body).toContain("No events to plot in this session.");
  });

  it("keeps a capture gap in view when the range falls inside the outage", async () => {
    service.recordHookPayload(
      toolAfter("read", { filePath: "before.ts" }, "call_before"),
      new Date("2026-10-25T10:00:00.000Z"),
    );
    service.recordHookPayload(
      {
        hook: "capture.gap",
        sessionID: SESSION,
        from: "2026-10-25T10:00:01.000Z",
        to: "2026-10-25T10:05:00.000Z",
        reason: "capture endpoint unavailable",
      },
      new Date("2026-10-25T10:05:00.000Z"),
    );
    service.recordHookPayload(
      toolAfter("read", { filePath: "after.ts" }, "call_after"),
      new Date("2026-10-25T10:07:00.000Z"),
    );
    const range = "from=2026-10-25T10:01:00.000Z&to=2026-10-25T10:04:00.000Z";

    const waterfall = await (await fetch(`${baseUrl}/sessions/${SESSION}?view=waterfall&${range}`)).text();
    const list = await (await fetch(`${baseUrl}/sessions/${SESSION}?${range}`)).text();

    expect(waterfall).toMatch(/<a class="wf-gap/);
    expect(waterfall).not.toContain("No events in this time range.");
    expect(list).toContain("1 of 3 events");
    expect(list).toContain("capture endpoint unavailable");
    expect(list).not.toContain("before.ts");
    expect(list).not.toContain("after.ts");
  });

  it("shows the selected range as a chip that clears it", async () => {
    seedThree();

    const body = await (
      await fetch(
        `${baseUrl}/sessions/${SESSION}?from=2026-10-25T10:00:04.000Z&to=2026-10-25T10:00:24.000Z`,
      )
    ).text();
    const chip = body.match(/<a class="chip active range" href="([^"]*)"[^>]*>([^<]*)/);

    expect(chip?.[2]).toContain("10:00:04–10:00:24");
    expect(chip?.[1]).toBe(`/sessions/${SESSION}`);
  });

  it("keeps the time range when a text search is submitted", async () => {
    seedThree();

    const body = await (
      await fetch(
        `${baseUrl}/sessions/${SESSION}?from=2026-10-25T10:00:04.000Z&to=2026-10-25T10:00:24.000Z`,
      )
    ).text();
    const form = body.match(/<form class="search"[\s\S]*?<\/form>/)?.[0] ?? "";

    expect(form).toContain('<input type="hidden" name="from" value="2026-10-25T10:00:04.000Z">');
    expect(form).toContain('<input type="hidden" name="to" value="2026-10-25T10:00:24.000Z">');
  });

  it("reads a range given backwards as the same range", async () => {
    seedThree();

    const body = await (
      await fetch(
        `${baseUrl}/sessions/${SESSION}?from=2026-10-25T10:00:24.000Z&to=2026-10-25T10:00:04.000Z`,
      )
    ).text();

    expect(body).toContain("2 of 3 events");
    expect(body).not.toContain("a.ts");
  });

  it("ignores range bounds that are not UTC ISO-8601 timestamps", async () => {
    seedThree();
    const unreadable = [
      "from=2026-10-25T10:00:04&to=2026-10-25T10:00:24",
      "from=1&to=10",
      "from=%2B010000-01-01T00:00:00.000Z&to=%2B010001-01-01T00:00:00.000Z",
    ];

    for (const range of unreadable) {
      const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?view=waterfall&${range}`)).text();
      expect(barTags(body), range).toHaveLength(3);
      expect(body, range).not.toContain('class="wf-reset"');
    }
  });

  it("tells the drag script which window the plot spans", async () => {
    seedThree();

    const whole = await (await fetch(`${baseUrl}/sessions/${SESSION}?view=waterfall`)).text();
    const zoomed = await (
      await fetch(
        `${baseUrl}/sessions/${SESSION}?view=waterfall&from=2026-10-25T10:00:04.000Z&to=2026-10-25T10:00:24.000Z`,
      )
    ).text();

    expect(whole).toContain(`data-t0="${Date.parse("2026-10-25T10:00:00.000Z")}" data-span="20500"`);
    expect(zoomed).toContain(`data-t0="${Date.parse("2026-10-25T10:00:04.000Z")}" data-span="20000"`);
  });
});
