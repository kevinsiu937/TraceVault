import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EventFactory } from "../../src/schema/EventFactory.js";
import { HookPayloadParser } from "../../src/capture/HookPayloadParser.js";
import { PayloadDigest } from "../../src/capture/PayloadDigest.js";
import { ToolClassifier } from "../../src/capture/ToolClassifier.js";
import { PluginHookCapture } from "../../src/capture/PluginHookCapture.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { ActivityView } from "../../src/dashboard/ActivityView.js";
import { DashboardServer } from "../../src/dashboard/DashboardServer.js";
import { SessionListView } from "../../src/dashboard/SessionListView.js";
import { TimelineView } from "../../src/dashboard/TimelineView.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";

const BASH_FIXTURE = new URL("../fixtures/tool-execute-after-bash.json", import.meta.url);

describe("seam A: HTTP request in, rendered page out", () => {
  const factory = new EventFactory();
  let directory: string;
  let store: SqliteEventStore;
  let server: DashboardServer;
  let baseUrl: string;

  function storeEvent(sessionId: string, timestamp: string): void {
    store.append(
      factory.fromClassified(
        { sessionId, correlationId: `call_${sessionId}_${timestamp}`, receivedAt: new Date(timestamp) },
        { type: "hook.script", data: { hook: "tool.execute.after", target_tool: "bash", target: "echo tracevault-fixture", exit_code: 0, outcome: "ok" } },
      ),
    );
  }

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-dashboard-"));
    store = new SqliteEventStore(join(directory, "events.db"));
    const service = new InvestigationService(
      new PluginHookCapture(new HookPayloadParser(), new ToolClassifier(new PayloadDigest()), factory),
      store,
      factory,
      new TimelineBuilder(),
    );
    server = new DashboardServer(service, new SessionListView(), new TimelineView(), new ActivityView());
    const port = await server.listen(0);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("lists stored sessions newest first with their event counts", async () => {
    storeEvent("ses_alpha", "2026-10-25T10:00:00.000Z");
    storeEvent("ses_alpha", "2026-10-25T10:05:00.000Z");
    storeEvent("ses_beta", "2026-10-25T11:00:00.000Z");

    const response = await fetch(`${baseUrl}/`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(body).toContain("ses_alpha");
    expect(body).toContain("ses_beta");
    expect(body).toContain(">2<");
    expect(body).toContain(">1<");
    expect(body.indexOf("ses_beta")).toBeLessThan(body.indexOf("ses_alpha"));
    expect(body.match(/>open</g)).toHaveLength(2);
  });

  it("accepts a recorded hook payload and shows the session", async () => {
    const response = await fetch(`${baseUrl}/hook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: readFileSync(BASH_FIXTURE, "utf8"),
    });

    expect(response.status).toBe(202);
    const page = await (await fetch(`${baseUrl}/`)).text();
    expect(page).toContain("ses_e8cd974edffegftWNtrKV3BXUe");
    expect(page).toContain(">1<");
  });

  it("rejects an unreadable payload without storing it", async () => {
    storeEvent("ses_alpha", "2026-10-25T10:00:00.000Z");

    const response = await fetch(`${baseUrl}/hook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(400);
    expect(store.listSessions()).toHaveLength(1);
  });

  it("escapes session data in the page", async () => {
    storeEvent("<b>x</b>", "2026-10-25T10:00:00.000Z");

    const body = await (await fetch(`${baseUrl}/`)).text();

    expect(body).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(body).not.toContain("<b>x</b>");
  });

  it("returns 404 for unknown paths and 405 for a wrong method", async () => {
    expect((await fetch(`${baseUrl}/hook`)).status).toBe(405);
    expect((await fetch(`${baseUrl}/nope`)).status).toBe(404);
  });
});
