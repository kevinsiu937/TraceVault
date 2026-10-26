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

const ROOT = "ses_root";
const CHILD_ONE = "ses_child_one";
const CHILD_TWO = "ses_child_two";
const SOLO = "ses_solo";

describe("seam A: subagents nest under their parent session", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-subagents-"));
    store = new SqliteEventStore(join(directory, "events.db"));
    const factory = new EventFactory();
    const capture = new PluginHookCapture(
      new HookPayloadParser(),
      new ToolClassifier(new PayloadDigest()),
      factory,
    );
    service = new InvestigationService(capture, store, factory, new TimelineBuilder());
    server = new DashboardServer(service, new SessionListView(), new TimelineView(), new ActivityView());
    baseUrl = `http://127.0.0.1:${await server.listen(0)}`;
  });

  afterEach(async () => {
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function created(sessionID: string, title: string, at: string, parentID?: string): void {
    service.recordHookPayload(
      { hook: "session.created", sessionID, title, ...(parentID === undefined ? {} : { parentID }) },
      new Date(at),
    );
  }

  function toolAfter(sessionID: string, callID: string, at: string): void {
    service.recordHookPayload(
      {
        hook: "tool.execute.after",
        input: { tool: "bash", sessionID, callID, args: { command: "echo tracevault" } },
        output: { title: "echo tracevault", metadata: { exit: 0 } },
      },
      new Date(at),
    );
  }

  function toolFailed(sessionID: string, callID: string, at: string): void {
    service.recordHookPayload(
      {
        hook: "tool.failed",
        input: { tool: "read", sessionID, callID, args: { filePath: "src/missing.ts" } },
        error: "File not found",
      },
      new Date(at),
    );
  }

  function seedRun(): void {
    created(ROOT, "Root session", "2026-10-25T10:00:00.000Z");
    toolAfter(ROOT, "call_root", "2026-10-25T10:00:01.000Z");

    created(CHILD_ONE, "Ticket 26 child one", "2026-10-25T10:01:00.000Z", ROOT);
    toolAfter(CHILD_ONE, "call_child_one_ok", "2026-10-25T10:01:01.000Z");
    toolFailed(CHILD_ONE, "call_child_one_bad", "2026-10-25T10:01:02.000Z");

    created(CHILD_TWO, "Child two", "2026-10-25T10:02:00.000Z", ROOT);
    service.recordHookPayload(
      { hook: "session.idle", sessionID: CHILD_TWO },
      new Date("2026-10-25T10:02:01.000Z"),
    );
    service.recordHookPayload(
      {
        hook: "capture.gap",
        sessionID: CHILD_TWO,
        from: "2026-10-25T10:02:01.000Z",
        to: "2026-10-25T10:02:02.000Z",
        reason: "capture endpoint unavailable",
      },
      new Date("2026-10-25T10:02:02.000Z"),
    );
  }

  it("lists roots on the main page and keeps child rows out of it", async () => {
    seedRun();

    const body = await (await fetch(`${baseUrl}/`)).text();

    expect(body).toContain(`data-session-id="${ROOT}"`);
    expect(body).toContain("Root session");
    expect(body).not.toContain(CHILD_ONE);
    expect(body).not.toContain(CHILD_TWO);
    expect(body).not.toContain("Ticket 26 child one");
  });

  it("renders a subagent portal on the parent page with one card per child", async () => {
    seedRun();

    const body = await (await fetch(`${baseUrl}/sessions/${ROOT}`)).text();

    expect(body).toContain("Subagents · 2");
    expect(body).toContain('class="subagent-title">Ticket 26 child one');
    expect(body).toContain('class="subagent-title">Child two');
    expect(body).toContain(`href="/sessions/${CHILD_ONE}"`);
    expect(body).toContain(`href="/sessions/${CHILD_TWO}"`);
    expect(body).toContain(">opencode<");
    expect(body).toContain(">2 events<");
    expect(body).toContain(">1 error<");
    expect(body).toContain(">1s<");
    expect(body).toContain(">open<");
    expect(body).toContain(">uncovered<");
  });

  it("leads a child page back to its parent", async () => {
    seedRun();

    const body = await (await fetch(`${baseUrl}/sessions/${CHILD_ONE}`)).text();

    expect(body).toContain(`<a class="parent-link" href="/sessions/${ROOT}">↑ Parent session</a>`);
    expect(body).toContain("Ticket 26 child one");
  });

  it("renders no portal for a root without children", async () => {
    created(SOLO, "Lonely root", "2026-10-25T10:00:00.000Z");

    const body = await (await fetch(`${baseUrl}/sessions/${SOLO}`)).text();

    expect(body).toContain("Lonely root");
    expect(body).not.toContain("Subagents ·");
    expect(body).not.toContain('id="subagents"');
    expect(body).not.toContain('class="parent-link"');
  });
});
