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

const SESSION = "ses_turns";
const HARNESS_PROMPT =
  "<available-skills>\n<name>matt-tdd</name>\nUse for test-first work.\n</available-skills>";

function prompt(
  text: string,
  messageID: string,
  createdAt: string,
): Record<string, unknown> {
  return {
    hook: "chat.message",
    sessionID: SESSION,
    messageID,
    createdAt,
    text,
  };
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

function dividers(body: string): string[] {
  return [...body.matchAll(/<li class="turn-divider[^"]*">[\s\S]*?<\/li>/g)].map(
    (match) => match[0],
  );
}

describe("seam A: turn-grouped timeline", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-turns-"));
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

  it("groups events under one divider per real prompt and skips the harness prompt", async () => {
    service.recordHookPayload(prompt("Fix the failing test", "msg_one", "2026-10-25T10:00:00.000Z"), new Date("2026-10-25T10:00:00.000Z"));
    service.recordHookPayload(toolAfter("read", { filePath: "a.ts" }, "call_a1"), new Date("2026-10-25T10:00:01.000Z"));
    service.recordHookPayload(toolAfter("bash", { command: "npm test" }, "call_a2"), new Date("2026-10-25T10:00:02.000Z"));
    service.recordHookPayload(prompt(HARNESS_PROMPT, "msg_harness", "2026-10-25T10:00:03.000Z"), new Date("2026-10-25T10:00:03.000Z"));
    service.recordHookPayload(prompt("Add a regression test", "msg_two", "2026-10-25T10:00:04.000Z"), new Date("2026-10-25T10:00:04.000Z"));
    service.recordHookPayload(toolAfter("read", { filePath: "b.ts" }, "call_b1"), new Date("2026-10-25T10:00:05.000Z"));
    service.recordHookPayload(toolAfter("bash", { command: "npx vitest run" }, "call_b2"), new Date("2026-10-25T10:00:06.000Z"));
    service.recordHookPayload(toolFailed("read", { filePath: "broken.ts" }, "call_b3", "File not found"), new Date("2026-10-25T10:00:07.000Z"));

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    const groups = dividers(body);

    expect(groups).toHaveLength(2);
    expect(body).not.toContain("available-skills");
    expect(groups[0]).toContain("Fix the failing test");
    expect(groups[0]).toContain("2 actions");
    expect(groups[0]).not.toContain("has-errors");
    expect(groups[1]).toContain("Add a regression test");
    expect(groups[1]).toContain("3 actions");
    expect(groups[1]).toContain("1 error");
    expect(groups[1]).toContain("has-errors");
  });

  it("renders one honest Full run group when the session has no prompts", async () => {
    service.recordHookPayload(toolAfter("read", { filePath: "a.ts" }, "call_a"), new Date("2026-10-25T10:00:00.000Z"));
    service.recordHookPayload(toolAfter("bash", { command: "ls" }, "call_b"), new Date("2026-10-25T10:00:01.000Z"));

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    const groups = dividers(body);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toContain("Full run");
    expect(groups[0]).toContain("2 actions");
  });

  it("renders one Filtered events group rather than misattributing filtered rows", async () => {
    service.recordHookPayload(prompt("Fix the failing test", "msg_one", "2026-10-25T10:00:00.000Z"), new Date("2026-10-25T10:00:00.000Z"));
    service.recordHookPayload(toolAfter("read", { filePath: "a.ts" }, "call_a"), new Date("2026-10-25T10:00:01.000Z"));
    service.recordHookPayload(toolAfter("bash", { command: "ls" }, "call_b"), new Date("2026-10-25T10:00:02.000Z"));

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?kind=document.access`)).text();
    const groups = dividers(body);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toContain("Filtered events");
    expect(groups[0]).toContain("1 action");
    expect(groups[0]).not.toContain("Fix the failing test");
  });
});
