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

const SESSION = "ses_expr";

function toolAfter(
  tool: string,
  args: Record<string, unknown>,
  callID: string,
  durationMs?: number,
): Record<string, unknown> {
  return {
    hook: "tool.execute.after",
    input: { tool, sessionID: SESSION, callID, args },
    output: { title: "t", metadata: { truncated: false } },
    ...(durationMs === undefined ? {} : { durationMs }),
  };
}

function rows(body: string): number {
  return (body.match(/class="event" data-event-id="/g) ?? []).length;
}

function lanes(body: string): number {
  return (body.match(/class="wf-lane"/g) ?? []).length;
}

describe("seam A: expression filters", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-expr-"));
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
      { hook: "session.created", sessionID: SESSION, title: "Expression session" },
      new Date("2026-10-27T10:00:00.000Z"),
    );
    service.recordHookPayload(
      toolAfter("read", { filePath: "src/vault/session-notes.ts" }, "call_notes"),
      new Date("2026-10-27T10:00:01.000Z"),
    );
    service.recordHookPayload(
      toolAfter(
        "edit",
        { filePath: "src/vault/report.md", oldString: "a", newString: "b" },
        "call_report",
        25,
      ),
      new Date("2026-10-27T10:00:02.000Z"),
    );
    service.recordHookPayload(
      toolAfter("web_search", { query: "tracevault" }, "call_search", 1234),
      new Date("2026-10-27T10:00:03.000Z"),
    );
    service.recordHookPayload(
      {
        hook: "tool.failed",
        input: {
          tool: "read",
          sessionID: SESSION,
          callID: "call_missing",
          args: { filePath: "src/vault/missing.ts" },
        },
        error: "File not found",
      },
      new Date("2026-10-27T10:00:04.000Z"),
    );
    service.recordHookPayload(
      toolAfter("read", { filePath: "docs/release notes.md" }, "call_release"),
      new Date("2026-10-27T10:00:05.000Z"),
    );
  });

  afterEach(async () => {
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("filters a page and its count by kind family", async () => {
    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?expr=kind%3Amcp`)).text();

    expect(rows(body)).toBe(1);
    expect(body).toContain("web · search");
    expect(body).not.toContain("src/vault/report.md");
    expect(body).not.toContain("src/vault/session-notes.ts");
    expect(body).toContain("1 of 6 events");
  });

  it("filters the waterfall pane by the same expression", async () => {
    const body = await (
      await fetch(`${baseUrl}/sessions/${SESSION}?view=waterfall&expr=kind%3Amcp`)
    ).text();

    expect(lanes(body)).toBe(1);
    const plotted = [...body.matchAll(/class="wf-lane"[^>]*data-kind="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(plotted).toEqual(["mcp.call"]);
  });

  it("filters by exact outcome", async () => {
    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?expr=outcome%3Aerror`)).text();

    expect(rows(body)).toBe(1);
    expect(body).toContain("src/vault/missing.ts");
    expect(body).not.toContain("src/vault/report.md");
    expect(body).toContain("1 of 6 events");
  });

  it("compares stored durations in milliseconds and drops events with none", async () => {
    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?expr=duration%3A%3E60`)).text();

    expect(rows(body)).toBe(1);
    expect(body).toContain("web · search");
    expect(body).not.toContain("src/vault/report.md");
    expect(body).not.toContain("src/vault/missing.ts");
  });

  it("matches path substrings case-insensitively", async () => {
    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?expr=path~SESSION`)).text();

    expect(rows(body)).toBe(2);
    expect(body).toContain("src/vault/session-notes.ts");
    expect(body).not.toContain("src/vault/report.md");
    expect(body).not.toContain("web · search");
  });

  it("matches bare words against the target and the event kind", async () => {
    const byTarget = await (await fetch(`${baseUrl}/sessions/${SESSION}?expr=release`)).text();
    expect(rows(byTarget)).toBe(1);
    expect(byTarget).toContain("docs/release notes.md");

    const byKind = await (await fetch(`${baseUrl}/sessions/${SESSION}?expr=document`)).text();
    expect(rows(byKind)).toBe(4);
  });

  it("matches a quoted phrase exactly", async () => {
    const expression = encodeURIComponent('"release notes"');
    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?expr=${expression}`)).text();

    expect(rows(body)).toBe(1);
    expect(body).toContain("docs/release notes.md");
    expect(body).not.toContain("src/vault/session-notes.ts");
  });

  it("composes repeated expressions and shows the filtered count", async () => {
    const body = await (
      await fetch(
        `${baseUrl}/sessions/${SESSION}?expr=kind%3Adocument.access&expr=outcome%3Derror`,
      )
    ).text();

    expect(rows(body)).toBe(1);
    expect(body).toContain("src/vault/missing.ts");
    expect(body).not.toContain("src/vault/report.md");
    expect(body).toContain("1 of 6 events");
  });

  it("keeps free text filtering while composing with an expression", async () => {
    const text = await (await fetch(`${baseUrl}/sessions/${SESSION}?q=report.md`)).text();
    expect(rows(text)).toBe(1);
    expect(text).toContain("src/vault/report.md");
    expect(text).not.toContain("src/vault/session-notes.ts");

    const composed = await (
      await fetch(`${baseUrl}/sessions/${SESSION}?q=vault&expr=outcome%3Aerror`)
    ).text();
    expect(rows(composed)).toBe(1);
    expect(composed).toContain("src/vault/missing.ts");
  });

  it("ignores invalid fragments instead of failing", async () => {
    const response = await fetch(`${baseUrl}/sessions/${SESSION}?expr=duration%3Aabc`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(rows(body)).toBe(6);
    expect(body).toContain("6 of 6 events");
  });

  it("round-trips the expression through the input, datalist and clear chip", async () => {
    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?expr=kind%3Amcp`)).text();

    expect(body).toContain('name="expr" value="kind:mcp"');
    expect(body).toContain('<datalist id="expression-suggestions"');
    expect(body).toContain('value="path~"');
    expect(body).toContain("duration:");

    const chip = /<a class="chip active expression" href="([^"]+)"[^>]*aria-label="Clear expression"/.exec(body);
    expect(chip).not.toBeNull();
    expect(chip?.[1]).not.toContain("expr=");
  });
});
