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

const SESSION = "ses_filters";
const OTHER = "ses_other";

function toolAfter(
  tool: string,
  args: Record<string, unknown>,
  callID: string,
  sessionID = SESSION,
): unknown {
  return {
    hook: "tool.execute.after",
    input: { tool, sessionID, callID, args },
    output: { title: "t", metadata: { truncated: false } },
  };
}

describe("seam A: URL filters over stored events", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-filters-"));
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

    service.recordHookPayload(
      { hook: "session.created", sessionID: SESSION, title: "Docs session" },
      new Date("2026-10-25T10:00:00.000Z"),
    );
    service.recordHookPayload(
      toolAfter("read", { filePath: "src/vault/read.ts" }, "call_read"),
      new Date("2026-10-25T10:00:01.000Z"),
    );
    service.recordHookPayload(
      toolAfter("edit", { filePath: "src/vault/write.ts", oldString: "a", newString: "b" }, "call_write"),
      new Date("2026-10-25T10:00:02.000Z"),
    );
    service.recordHookPayload(
      toolAfter("skill", { name: "review" }, "call_skill"),
      new Date("2026-10-25T10:00:03.000Z"),
    );
    service.recordHookPayload(
      {
        hook: "tool.failed",
        input: { tool: "read", sessionID: SESSION, callID: "call_fail", args: { filePath: "src/vault/missing.ts" } },
        error: "File not found",
      },
      new Date("2026-10-25T10:00:04.000Z"),
    );

    service.recordHookPayload(
      { hook: "session.created", sessionID: OTHER, title: "Other session" },
      new Date("2026-10-25T11:00:00.000Z"),
    );
    service.recordHookPayload(
      toolAfter("edit", { filePath: "src/other/write.ts", oldString: "a", newString: "b" }, "call_other", OTHER),
      new Date("2026-10-25T11:00:01.000Z"),
    );
  });

  afterEach(async () => {
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("filters a session timeline by kind and operation", async () => {
    const response = await fetch(`${baseUrl}/sessions/${SESSION}?kind=document.access&operation=write`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("src/vault/write.ts");
    expect(body).not.toContain("src/vault/read.ts");
    expect(body).not.toContain("src/vault/missing.ts");

    const rendered = (body.match(/class="event" data-event-id="/g) ?? []).length;
    const stored = store.listMatching({
      sessionId: SESSION,
      kinds: ["document.access"],
      outcomes: [],
      operations: ["write"],
      text: "",
    });
    expect(rendered).toBe(stored.length);
    expect(stored).toHaveLength(1);
  });

  it("filters by outcome and by free text over targets", async () => {
    const errors = await (await fetch(`${baseUrl}/sessions/${SESSION}?outcome=error`)).text();
    expect(errors).toContain("src/vault/missing.ts");
    expect(errors).not.toContain("src/vault/read.ts");

    const text = await (await fetch(`${baseUrl}/sessions/${SESSION}?q=write.ts`)).text();
    expect(text).toContain("src/vault/write.ts");
    expect(text).not.toContain("src/vault/read.ts");
    expect(text).not.toContain("src/other/write.ts");
  });

  it("lists matching events across sessions, newest session first", async () => {
    const body = await (await fetch(`${baseUrl}/activity?kind=document.access&operation=write`)).text();

    expect(body).toContain("src/other/write.ts");
    expect(body).toContain("src/vault/write.ts");
    expect(body).not.toContain("src/vault/read.ts");
    expect(body.indexOf(OTHER)).toBeLessThan(body.indexOf(SESSION));
  });

  it("makes documents modified, skills used and failures one click away", async () => {
    const body = await (await fetch(`${baseUrl}/activity`)).text();

    expect(body).toContain("kind=document.access");
    expect(body).toContain("operation=write");
    expect(body).toContain("kind=skill.call");
    expect(body).toContain("outcome=error");
  });

  it("keeps filter state in the URL across a reload and in chip links", async () => {
    const url = `${baseUrl}/activity?q=vault&outcome=ok`;
    const first = await (await fetch(url)).text();
    const second = await (await fetch(url)).text();

    expect(first).toBe(second);
    expect(first).toContain('name="q" value="vault"');
    expect(first).toContain("outcome=ok");
  });

  it("says explicitly when no rows match", async () => {
    const session = await fetch(`${baseUrl}/sessions/${SESSION}?q=does-not-exist`);
    const activity = await fetch(`${baseUrl}/activity?q=does-not-exist`);

    expect(session.status).toBe(200);
    expect(await session.text()).toContain("No events match this filter");
    expect(activity.status).toBe(200);
    expect(await activity.text()).toContain("No events match this filter");
  });
});
