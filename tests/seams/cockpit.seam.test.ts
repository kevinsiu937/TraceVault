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
import { EventFactory } from "../../src/schema/EventFactory.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

const SESSION = "ses_cockpit";
const OLDER = "ses_cockpit_older";
const NEWER = "ses_cockpit_newer";
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
  sessionID = SESSION,
): Record<string, unknown> {
  return { hook: "tool.failed", input: { tool, sessionID, callID, args }, error };
}

function aside(body: string): string {
  const start = body.indexOf("<aside");
  const end = body.indexOf("</aside>");
  return start < 0 || end < 0 ? "" : body.slice(start, end);
}

describe("seam A: the investigation cockpit", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-cockpit-"));
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
        [new SessionRailView(), timelineView],
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

  function seedSiblings(): void {
    service.recordHookPayload(
      { hook: "session.created", sessionID: SESSION, title: "Investigate vault" },
      new Date("2026-10-25T10:00:00.000Z"),
    );
    service.recordHookPayload(
      toolAfter("read", { filePath: "src/vault/plan.md" }, "call_ok"),
      new Date("2026-10-25T10:00:01.000Z"),
    );
    service.recordHookPayload(
      toolFailed("read", { filePath: "src/vault/missing.md" }, "call_err", "File not found"),
      new Date("2026-10-25T10:00:02.000Z"),
    );
    service.recordHookPayload(
      toolFailed("read", { filePath: "src/vault/secret.md" }, "call_denied", DENIAL),
      new Date("2026-10-25T10:00:03.000Z"),
    );
    service.recordHookPayload(
      { hook: "session.created", sessionID: OLDER, title: "Older session" },
      new Date("2026-10-25T09:00:00.000Z"),
    );
    service.recordHookPayload(
      { hook: "session.created", sessionID: NEWER, title: "Newer session" },
      new Date("2026-10-25T11:00:00.000Z"),
    );
  }

  it("renders a dark three-pane layout with inline assets only", async () => {
    seedSiblings();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();

    expect(body).toContain("grid-template-columns:230px 1fr 330px");
    expect(body).toContain("position:sticky");
    expect(body).toContain("body class=\"cockpit\"");
    expect(body).toMatch(/\.cockpit\{[^}]*--panel:#1c1c1e/);
    expect(body).toContain("color-scheme:dark");
    expect(body).not.toContain("<link");
    expect(body).not.toMatch(/<script[^>]*\bsrc=/);
    expect(body).not.toMatch(/<img\b/i);
    expect(body.match(/<style>/g)).toHaveLength(1);
  });

  it("shows session identity, aggregate counts and sibling stepping", async () => {
    seedSiblings();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();

    expect(body).toContain("Investigate vault");
    expect(body).toContain(SESSION);
    expect(body).toContain("opencode");
    expect(body).toContain("10:00:00");
    expect(body).toContain("3s");
    expect(body).toContain('<span class="stat-value">4</span> <span class="stat-label">events</span>');
    expect(body).toContain('<span class="stat-value">1</span> <span class="stat-label">error</span>');
    expect(body).toContain('<span class="stat-value">1</span> <span class="stat-label">denied</span>');
    expect(body).toContain(`href="/sessions/${OLDER}"`);
    expect(body).toContain(`href="/sessions/${NEWER}"`);
  });

  it("renders disabled stepping text for a session with no siblings", async () => {
    service.recordHookPayload(
      toolAfter("read", { filePath: "src/lonely.ts" }, "call_lonely", "ses_lone"),
      new Date("2026-10-25T10:00:00.000Z"),
    );

    const body = await (await fetch(`${baseUrl}/sessions/ses_lone`)).text();

    expect(body).toContain("<h1>ses_lone</h1>");
    expect(body.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(body).toContain("← Previous");
    expect(body).toContain("Next →");
  });

  it("puts the selected event's stored JSON in the detail pane", async () => {
    seedSiblings();
    const selected = service
      .getTimeline(SESSION)
      .find((entry) => entry.target === "src/vault/plan.md");
    expect(selected).toBeDefined();
    const eventId = selected?.eventId ?? "";

    const body = await (
      await fetch(`${baseUrl}/sessions/${SESSION}?event=${encodeURIComponent(eventId)}`)
    ).text();
    const detail = aside(body);

    expect(detail).toContain(eventId);
    expect(detail).toContain("document.access");
    expect(detail).toContain("src/vault/plan.md");
    expect(detail).toContain("ok");
    expect(detail).toContain("10:00:01");
    expect(detail).toContain("schema_version");
    expect(detail).toContain("prev_hash");
    expect(detail).toContain("plugin_hook");
    expect(body).toContain('class="event-row selected"');
    expect(body).toContain('aria-current="true"');
    expect(body).toContain(`?event=${eventId}`);
  });

  it("shows a calm empty state until an event is selected", async () => {
    seedSiblings();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();

    expect(aside(body)).toContain("Select an event");
  });

  it("renders gaps distinctly and spells out every outcome", async () => {
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
      toolFailed("read", { filePath: "a.ts" }, "call_err", "File not found"),
      new Date("2026-10-25T10:00:06.000Z"),
    );
    service.recordHookPayload(
      toolFailed("read", { filePath: "b.ts" }, "call_denied", DENIAL),
      new Date("2026-10-25T10:00:07.000Z"),
    );

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();

    expect(body).toContain('data-kind="capture.gap"');
    expect(body).toContain('class="pill gap">gap</span>');
    expect(body).toContain('class="pill error">error</span>');
    expect(body).toContain('class="pill denied">denied</span>');
    expect(body).toContain("capture endpoint unavailable");
  });

  it("landmarks all three panes and keeps rows keyboard reachable", async () => {
    seedSiblings();
    const selected = service
      .getTimeline(SESSION)
      .find((entry) => entry.target === "src/vault/plan.md");
    const eventId = selected?.eventId ?? "";

    const body = await (
      await fetch(`${baseUrl}/sessions/${SESSION}?event=${encodeURIComponent(eventId)}`)
    ).text();

    expect(body).toContain("<nav");
    expect(body).toContain("<main");
    expect(body).toContain("<aside");
    expect(aside(body)).toContain("<h2");
    expect(body).toMatch(/<a class="event-row[^"]*" href="[^"]*\?event=/);
    expect(body).toContain("<summary");
  });
});
