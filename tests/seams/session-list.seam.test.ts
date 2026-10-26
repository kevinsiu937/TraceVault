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

const DENIAL = "The user rejected permission to use this specific tool call";

function rowFor(body: string, sessionId: string): string {
  const start = body.indexOf(`<tr data-session-id="${sessionId}">`);
  if (start < 0) {
    return "";
  }
  const end = body.indexOf("</tr>", start);
  return body.slice(start, end);
}

function cells(row: string): string[] {
  return [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1] ?? "");
}

describe("seam A: the enriched session list", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-session-list-"));
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

  function started(sessionId: string, title: string, at: string): void {
    service.recordHookPayload(
      { hook: "session.created", sessionID: sessionId, title },
      new Date(at),
    );
  }

  function read(sessionId: string, filePath: string, callId: string, at: string): void {
    service.recordHookPayload(
      {
        hook: "tool.execute.after",
        input: { tool: "read", sessionID: sessionId, callID: callId, args: { filePath } },
        output: { title: "t", metadata: { truncated: false } },
      },
      new Date(at),
    );
  }

  function failedBash(sessionId: string, callId: string, at: string, error: string): void {
    service.recordHookPayload(
      {
        hook: "tool.failed",
        input: { tool: "bash", sessionID: sessionId, callID: callId, args: { command: "false" } },
        error,
      },
      new Date(at),
    );
  }

  function ended(sessionId: string, at: string): void {
    service.recordHookPayload({ hook: "session.idle", sessionID: sessionId }, new Date(at));
  }

  function seedThreeSessions(): void {
    started("ses_a", "Session A", "2026-10-25T10:00:00.000Z");
    read("ses_a", "src/a.ts", "call_a_1", "2026-10-25T10:00:01.000Z");
    read("ses_a", "src/a.ts", "call_a_2", "2026-10-25T10:00:02.000Z");
    read("ses_a", "src/b.ts", "call_a_3", "2026-10-25T10:00:03.000Z");
    failedBash("ses_a", "call_a_err", "2026-10-25T10:00:04.000Z", "command failed");
    failedBash("ses_a", "call_a_denied", "2026-10-25T10:00:05.000Z", DENIAL);
    ended("ses_a", "2026-10-25T10:00:06.000Z");

    started("ses_b", "Session B", "2026-10-25T11:00:00.000Z");
    read("ses_b", "src/b1.ts", "call_b_1", "2026-10-25T11:00:01.000Z");
    read("ses_b", "src/b2.ts", "call_b_2", "2026-10-25T11:00:02.000Z");
    read("ses_b", "src/b3.ts", "call_b_3", "2026-10-25T11:00:03.000Z");
    read("ses_b", "src/b4.ts", "call_b_4", "2026-10-25T11:00:04.000Z");
    ended("ses_b", "2026-10-25T11:00:05.000Z");

    started("ses_c", "Session C", "2026-10-25T12:00:00.000Z");
    read("ses_c", "src/c.ts", "call_c_1", "2026-10-25T12:00:01.000Z");
  }

  function seedEndedWithError(sessionId: string, title: string, at: string): void {
    started(sessionId, title, at);
    failedBash(sessionId, `${sessionId}_err`, at.replace(":00.000Z", ":01.000Z"), "command failed");
    ended(sessionId, at.replace(":00.000Z", ":02.000Z"));
  }

  it("renders a sparkline, counts, duration and a word-bearing outcome badge per row", async () => {
    seedThreeSessions();

    const body = await (await fetch(`${baseUrl}/`)).text();

    for (const sessionId of ["ses_a", "ses_b", "ses_c"]) {
      const row = rowFor(body, sessionId);
      expect(row.length).toBeGreaterThan(0);
      expect(row).toContain('<svg class="spark"');
      expect((row.match(/<rect/g) ?? []).length).toBe(12);
    }

    const a = cells(rowFor(body, "ses_a"));
    expect(a[4]).toBe("5");
    expect(a[5]).toBe("2");
    expect(a[6]).toBe("1");
    expect(a[7]).toBe("1");
    expect(a[8]).toBe("4s");
    expect(a[10]).toContain("has errors");

    const b = cells(rowFor(body, "ses_b"));
    expect(b[4]).toBe("4");
    expect(b[5]).toBe("4");
    expect(b[6]).toBe("0");
    expect(b[7]).toBe("0");
    expect(b[8]).toBe("3s");
    expect(b[10]).toContain("clean");

    const c = cells(rowFor(body, "ses_c"));
    expect(c[8]).toBe("—");
    expect(c[10]).toContain("open");
  });

  it("warns when two consecutive sessions ended with errors, naming both", async () => {
    seedEndedWithError("ses_d", "Session D", "2026-10-25T13:00:00.000Z");
    seedEndedWithError("ses_e", "Session E", "2026-10-25T12:00:00.000Z");

    const body = await (await fetch(`${baseUrl}/`)).text();
    const start = body.indexOf('<section class="card streak"');
    const callout = body.slice(start, body.indexOf("</section>", start));

    expect(start).toBeGreaterThanOrEqual(0);
    expect(callout).toContain("2 sessions in a row ended with errors");
    expect(callout).toContain("ses_d");
    expect(callout).toContain("Session D");
    expect(callout).toContain("ses_e");
    expect(callout).toContain("Session E");
  });

  it("does not warn when only one session ended with an error", async () => {
    seedEndedWithError("ses_d", "Session D", "2026-10-25T13:00:00.000Z");
    started("ses_e", "Session E", "2026-10-25T12:00:00.000Z");
    read("ses_e", "src/e.ts", "call_e_ok", "2026-10-25T12:00:01.000Z");
    ended("ses_e", "2026-10-25T12:00:02.000Z");

    const body = await (await fetch(`${baseUrl}/`)).text();

    expect(body).not.toContain("sessions in a row ended with errors");
    expect(body).not.toContain('class="card streak"');
  });

  it("keeps the empty list message", async () => {
    const body = await (await fetch(`${baseUrl}/`)).text();

    expect(body).toContain("No sessions captured yet.");
    expect(body).not.toContain('<svg class="spark"');
  });
});
