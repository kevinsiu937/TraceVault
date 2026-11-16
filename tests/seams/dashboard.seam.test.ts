import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ServiceAssembly } from "../../src/cli/ServiceAssembly.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";
import { DashboardServer } from "../../src/dashboard/DashboardServer.js";

const BASH_FIXTURE = new URL("../fixtures/tool-execute-after-bash.json", import.meta.url);

describe("seam A: HTTP request in, rendered page out", () => {
  const factory = new EventFactory();
  let directory: string;
  let store: SqliteEventStore;
  let server: DashboardServer;
  let baseUrl: string;
  let errors: string[];

  function storeEvent(sessionId: string, timestamp: string): void {
    store.append(
      factory.fromClassified(
        { sessionId, correlationId: `call_${sessionId}_${timestamp}`, receivedAt: new Date(timestamp) },
        { type: "hook.script", data: { hook: "tool.execute.after", target_tool: "bash", target: "echo tracevault-fixture", exit_code: 0, outcome: "ok" } },
      ),
    );
  }

  // fetch refuses to set Host, so a browser on another site is played by a raw request.
  function send(method: string, path: string, headers: Record<string, string>, body = ""): Promise<number> {
    return new Promise((resolve, reject) => {
      const outgoing = request(`${baseUrl}${path}`, { method, headers }, (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      outgoing.on("error", reject);
      outgoing.end(body);
    });
  }

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-dashboard-"));
    errors = [];
    ({ store, server } = new ServiceAssembly().open(join(directory, "events.db"), (line) => errors.push(line)));
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

  it("answers 500 to a request it cannot handle and prints one line naming the path and the error, not the body", async () => {
    store.close();

    const response = await fetch(`${baseUrl}/hook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: readFileSync(BASH_FIXTURE, "utf8"),
    });
    store = new SqliteEventStore(join(directory, "events.db"));

    expect(response.status).toBe(500);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/\/hook/);
    expect(errors[0]).toMatch(/not open/);
    expect(errors[0]).not.toContain("ses_e8cd974edffegftWNtrKV3BXUe");
  });

  it("answers 500, not 400, when the store fails while naming an MCP tool's server", async () => {
    store.close();

    const response = await fetch(`${baseUrl}/hook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hook: "tool.execute.after", input: { tool: "google_drive_search", sessionID: "ses_mcp", callID: "call_mcp", args: {} }, output: { title: "", metadata: {} } }),
    });
    store = new SqliteEventStore(join(directory, "events.db"));

    expect(response.status).toBe(500);
    expect(errors).toHaveLength(1);
  });

  it("cuts a long prompt's timeline row to 200 characters", async () => {
    const text = `${"x".repeat(300)}END`;
    store.append(factory.promptUser({ sessionId: "ses_long", correlationId: "msg_long", receivedAt: new Date("2026-10-25T10:00:00.000Z") }, { text, message_id: "msg_long", truncated: false }));

    const page = await (await fetch(`${baseUrl}/sessions/ses_long`)).text();
    const targets = [...page.matchAll(/<span class="target mono">([^<]*)<\/span>/g)].map((match) => match[1]);

    expect(targets).toContain(`${"x".repeat(199)}…`);
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

  it("refuses a page asked for under another site's name", async () => {
    storeEvent("ses_alpha", "2026-10-25T10:00:00.000Z");

    expect(await send("GET", "/", { host: "evil.example" })).toBe(403);
    expect(await send("GET", "/sessions/ses_alpha", { host: "evil.example:4319" })).toBe(403);
  });

  it("refuses an event posted by another site's page and stores nothing", async () => {
    const status = await send("POST", "/hook", { origin: "https://evil.example", "content-type": "text/plain" }, readFileSync(BASH_FIXTURE, "utf8"));

    expect(status).toBe(403);
    expect(store.listSessions()).toHaveLength(0);
  });

  it("serves its own pages under localhost, and to a request its own page makes", async () => {
    const port = new URL(baseUrl).port;

    expect(await send("GET", "/", { host: `localhost:${port}` })).toBe(200);
    expect(await send("GET", "/", { origin: baseUrl })).toBe(200);
  });
});
