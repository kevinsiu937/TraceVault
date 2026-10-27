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
import { ReplayBarView } from "../../src/dashboard/ReplayBarView.js";
import { SessionHeaderView } from "../../src/dashboard/SessionHeaderView.js";
import { SessionListView } from "../../src/dashboard/SessionListView.js";
import { SessionPageView } from "../../src/dashboard/SessionPageView.js";
import { TimelineView } from "../../src/dashboard/TimelineView.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

const SESSION = "ses_replay";
const DENIAL = "The user rejected permission to use this specific tool call";

function prompt(text: string, messageID: string, createdAt: string): Record<string, unknown> {
  return { hook: "chat.message", sessionID: SESSION, messageID, createdAt, text };
}

function toolAfter(
  tool: string,
  args: Record<string, unknown>,
  callID: string,
): Record<string, unknown> {
  return {
    hook: "tool.execute.after",
    input: { tool, sessionID: SESSION, callID, args },
    output: { title: "t", metadata: { truncated: false } },
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

function dividerClasses(body: string): string[] {
  return [...body.matchAll(/<li class="turn-divider([^"]*)"/g)].map((match) => match[1] ?? "");
}

function eventClasses(body: string): string[] {
  return [...body.matchAll(/<li class="event([^"]*)" data-event-id=/g)].map(
    (match) => match[1] ?? "",
  );
}

function bar(body: string): string {
  const start = body.indexOf('<div class="replay-bar"');
  const end = body.indexOf("</div>\n</div>", start);
  return start < 0 ? "" : body.slice(start, end);
}

describe("seam A: the replay bar", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-replay-"));
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
        [timelineView, new ReplayBarView()],
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

  function seedTurns(): void {
    service.recordHookPayload(prompt("Fix the failing test", "msg_one", "2026-10-25T10:00:00.000Z"), new Date("2026-10-25T10:00:00.000Z"));
    service.recordHookPayload(toolAfter("read", { filePath: "a.ts" }, "call_a1"), new Date("2026-10-25T10:00:01.000Z"));
    service.recordHookPayload(toolFailed("read", { filePath: "broken.ts" }, "call_a2", "File not found"), new Date("2026-10-25T10:00:02.000Z"));
    service.recordHookPayload(prompt("Add a regression test", "msg_two", "2026-10-25T10:00:04.000Z"), new Date("2026-10-25T10:00:04.000Z"));
    service.recordHookPayload(toolAfter("read", { filePath: "b.ts" }, "call_b1"), new Date("2026-10-25T10:00:05.000Z"));
    service.recordHookPayload(toolFailed("read", { filePath: "secret.ts" }, "call_b2", DENIAL), new Date("2026-10-25T10:00:06.000Z"));
    service.recordHookPayload(
      {
        hook: "capture.gap",
        sessionID: SESSION,
        from: "2026-10-25T10:00:06.000Z",
        to: "2026-10-25T10:00:07.000Z",
        reason: "capture endpoint unavailable",
      },
      new Date("2026-10-25T10:00:07.000Z"),
    );
  }

  it("marks exactly one active turn at t=0 and moves it forward as t advances", async () => {
    seedTurns();

    const atStart = dividerClasses(await (await fetch(`${baseUrl}/sessions/${SESSION}?t=0`)).text());
    expect(atStart).toHaveLength(2);
    expect(atStart.filter((classes) => classes.includes("is-active"))).toHaveLength(1);
    expect(atStart[0]).toContain("is-active");
    expect(atStart[1]).not.toContain("is-past");
    expect(atStart[1]).not.toContain("is-active");

    const later = dividerClasses(
      await (await fetch(`${baseUrl}/sessions/${SESSION}?t=4000`)).text(),
    );
    expect(later.filter((classes) => classes.includes("is-active"))).toHaveLength(1);
    expect(later[0]).not.toContain("is-active");
    expect(later[1]).toContain("is-active");
  });

  it("dims the turns wholly before t and brightens the turn containing t", async () => {
    seedTurns();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?t=4000`)).text();
    const dividers = dividerClasses(body);

    expect(dividers[0]).toContain("is-past");
    expect(dividers[1]).toContain("is-active");

    const rows = eventClasses(body);
    expect(rows.filter((classes) => classes.includes("is-active")).length).toBeGreaterThan(0);
    expect(rows.filter((classes) => classes.includes("is-past")).length).toBeGreaterThan(0);
    expect(rows.filter((classes) => classes.includes("is-active")).length).toBeLessThan(rows.length);
  });

  it("renders play, step, speed, timer, one tick per turn and a labelled tick per key moment", async () => {
    seedTurns();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    const html = bar(body);

    expect(html).toContain('id="replay-play"');
    expect(html).toContain('id="replay-step"');
    expect(html).toContain('id="replay-speed"');
    expect(html).toContain(">0.5×<");
    expect(html).toContain(">1×<");
    expect(html).toContain(">2×<");
    expect(html).toContain(">4×<");
    expect(html).toContain('id="replay-timer"');
    expect(html).toContain("0:00 / 0:07");
    expect((html.match(/class="replay-tick replay-turn"/g) ?? [])).toHaveLength(2);
    expect(html).toContain('class="replay-tick replay-error"');
    expect(html).toContain('title="error · broken.ts"');
    expect(html).toContain('class="replay-tick replay-denied"');
    expect(html).toContain('title="denied · secret.ts"');
    expect(html).toContain('class="replay-tick replay-gap"');
    expect(html).toContain('title="gap · capture endpoint unavailable"');
    expect(html).not.toContain("<input");
  });

  it("seeks without a reload by replacing the URL state", async () => {
    seedTurns();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?t=0`)).text();

    expect(body).toContain("history.replaceState");
    expect(body).toContain('searchParams.set("t"');
    expect(body).not.toContain("location.reload");
  });

  it("binds space and the arrow keys and keeps dimming under reduced motion", async () => {
    seedTurns();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();

    expect(body).toContain('event.code === "Space"');
    expect(body).toContain('event.key === "ArrowRight"');
    expect(body).toContain('event.key === "ArrowLeft"');
    expect(body).toContain(".center .event.is-past,.center .turn-divider.is-past{opacity:.35");
    expect(body).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\s*\.center \.event\.is-past/);
    expect(body).toContain(".center .event.is-past,.center .turn-divider.is-past{transition:none}");
  });

  it("renders no bar for a session with no prompts", async () => {
    service.recordHookPayload(toolAfter("read", { filePath: "a.ts" }, "call_a"), new Date("2026-10-25T10:00:00.000Z"));
    service.recordHookPayload(toolAfter("bash", { command: "ls" }, "call_b"), new Date("2026-10-25T10:00:01.000Z"));

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?t=0`)).text();

    expect(body).not.toContain('id="replay"');
    expect(body).not.toContain('class="replay-bar"');
  });
});
