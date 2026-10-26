import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HookPayloadParser } from "../../src/capture/HookPayloadParser.js";
import { PayloadDigest } from "../../src/capture/PayloadDigest.js";
import { PluginHookCapture } from "../../src/capture/PluginHookCapture.js";
import { ToolClassifier } from "../../src/capture/ToolClassifier.js";
import { PendingGapStore } from "../../src/plugin/PendingGapStore.js";
import { TraceVaultPlugin } from "../../src/plugin/TraceVaultPlugin.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

const BASH_FIXTURE = new URL("../fixtures/tool-execute-after-bash.json", import.meta.url);
const BASH_DURATION_FIXTURE = new URL("../fixtures/tool-execute-after-bash-duration.json", import.meta.url);
const BASH_ERROR_FIXTURE = new URL("../fixtures/tool-execute-after-bash-error.json", import.meta.url);
const DENIED_FIXTURE = new URL("../fixtures/tool-failed-denied.json", import.meta.url);
const FIXTURE_DIRECTORY = new URL("../fixtures/", import.meta.url);
const RECEIVED_AT = new Date("2026-10-25T11:32:04.812Z");

// shortcut: Vitest's bundled Vite predates node:sqlite; Node's resolver loads it.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    prepare(sql: string): { run(...parameters: unknown[]): void };
    close(): void;
  };
};

function readFixture(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8"));
}

function toolAfter(
  tool: string,
  args: Record<string, unknown>,
  callID = `call_${tool}`,
  sessionID = "ses_surface",
): Record<string, unknown> {
  return {
    hook: "tool.execute.after",
    input: { tool, sessionID, callID, args },
    output: { title: "title", metadata: { truncated: false } },
  };
}

function clockFrom(ticks: number[]): () => number {
  return () => ticks.shift() ?? 0;
}

describe("seam B: hook payload in, stored events out", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-capture-"));
    store = new SqliteEventStore(join(directory, "events.db"));
    const factory = new EventFactory();
    const capture = new PluginHookCapture(
      new HookPayloadParser(),
      new ToolClassifier(new PayloadDigest()),
      factory,
    );
    service = new InvestigationService(capture, store, factory, new TimelineBuilder());
  });

  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("stores exactly one hook.script event for a recorded bash call", () => {
    expect(service.recordHookPayload(readFixture(BASH_FIXTURE), RECEIVED_AT)).toBe("stored");

    const events = store.listBySession("ses_e8cd974edffegftWNtrKV3BXUe");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      schema_version: 1,
      type: "hook.script",
      session_id: "ses_e8cd974edffegftWNtrKV3BXUe",
      agent: { name: "opencode", version: "unknown" },
      capture_path: "plugin_hook",
      timestamp: "2026-10-25T11:32:04.812Z",
      seq: null,
      correlation_id: "chatcmpl-tool-97b767f4350cf67d",
      raw_extra: {},
    });
    expect(events[0]?.id).toMatch(/^evt_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(events[0]?.prev_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("puts the command, exit code and ok outcome in the hook payload", () => {
    service.recordHookPayload(readFixture(BASH_FIXTURE), RECEIVED_AT);

    const [event] = store.listBySession("ses_e8cd974edffegftWNtrKV3BXUe");
    expect(event?.data).toEqual({
      hook: "tool.execute.after",
      target_tool: "bash",
      target: "echo tracevault-fixture",
      exit_code: 0,
      outcome: "ok",
    });
  });

  it("marks a non-zero exit as an error", () => {
    service.recordHookPayload(readFixture(BASH_ERROR_FIXTURE), RECEIVED_AT);

    const [event] = store.listBySession("ses_e8cc84dd5ffezMElbZGxc6lO2I");
    expect(event?.data).toMatchObject({ target: "cmd /c exit 1", exit_code: 1, outcome: "error" });
  });

  it("classifies a read as a document.access event", () => {
    service.recordHookPayload(toolAfter("read", { filePath: "src/cli/index.ts" }), RECEIVED_AT);

    const [event] = store.listBySession("ses_surface");
    expect(event?.type).toBe("document.access");
    expect(event?.data).toMatchObject({ path: "src/cli/index.ts", operation: "read", outcome: "ok" });
  });

  it("classifies an edit as a write to the same path", () => {
    service.recordHookPayload(
      toolAfter("edit", { filePath: "src/cli/index.ts", oldString: "a", newString: "b" }),
      RECEIVED_AT,
    );

    const [event] = store.listBySession("ses_surface");
    expect(event?.data).toMatchObject({ path: "src/cli/index.ts", operation: "write" });
  });

  it("records a web fetch with the URL as its target", () => {
    service.recordHookPayload(toolAfter("webfetch", { url: "https://example.com" }), RECEIVED_AT);

    const [event] = store.listBySession("ses_surface");
    expect(event?.type).toBe("hook.script");
    expect(event?.data).toMatchObject({ target_tool: "webfetch", target: "https://example.com", outcome: "ok" });
  });

  it("records an MCP tool call with server and tool name", () => {
    service.recordHookPayload(
      toolAfter("context7_resolve-library-id", { libraryName: "express", query: "routing" }),
      RECEIVED_AT,
    );

    const [event] = store.listBySession("ses_surface");
    expect(event?.type).toBe("mcp.call");
    expect(event?.data).toMatchObject({ server: "context7", tool: "resolve-library-id", outcome: "ok" });
    expect(event?.data).toMatchObject({ args_digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) });
  });

  it("records a failed tool call as an error with no success fields", () => {
    service.recordHookPayload(
      {
        hook: "tool.failed",
        input: {
          tool: "read",
          sessionID: "ses_surface",
          callID: "call_failed_read",
          args: { filePath: "missing.txt" },
        },
        error: "File not found: missing.txt",
      },
      RECEIVED_AT,
    );

    const [event] = store.listBySession("ses_surface");
    expect(event?.type).toBe("document.access");
    expect(event?.data).toEqual({ path: "missing.txt", operation: "read", outcome: "error" });
  });

  it("stores the title forwarded with session.created", () => {
    service.recordHookPayload(
      { hook: "session.created", sessionID: "ses_title", title: "Fix the leak" },
      RECEIVED_AT,
    );

    expect(service.listSessions()[0]).toMatchObject({ sessionId: "ses_title", title: "Fix the leak" });
  });

  it("marks a completed session with an end and reopens it when a later event arrives", () => {
    service.recordHookPayload({ hook: "session.created", sessionID: "ses_life" }, RECEIVED_AT);
    service.recordHookPayload(toolAfter("read", { filePath: "a.ts" }, "call_life", "ses_life"), RECEIVED_AT);
    service.recordHookPayload(
      { hook: "session.idle", sessionID: "ses_life" },
      new Date("2026-10-25T11:40:00.000Z"),
    );

    const closed = service.listSessions().find((session) => session.sessionId === "ses_life");
    expect(closed).toMatchObject({ sessionId: "ses_life", endedAt: "2026-10-25T11:40:00.000Z", eventCount: 1 });

    service.recordHookPayload(toolAfter("read", { filePath: "b.ts" }, "call_after_idle", "ses_life"), new Date("2026-10-25T11:41:00.000Z"));
    expect(service.listSessions().find((session) => session.sessionId === "ses_life")?.endedAt).toBeNull();
  });

  it("records a second observation as a duplicate and shows the action once in the timeline", () => {
    service.recordHookPayload(readFixture(BASH_FIXTURE), RECEIVED_AT);
    service.recordHookPayload(readFixture(BASH_FIXTURE), RECEIVED_AT);

    const sessionId = "ses_e8cd974edffegftWNtrKV3BXUe";
    const stored = store.listBySession(sessionId);
    expect(stored.filter((event) => event.type === "hook.script")).toHaveLength(2);
    expect(stored.filter((event) => event.type === "capture.duplicate")).toHaveLength(1);
    expect(service.getTimeline(sessionId)).toHaveLength(1);
    expect(service.listSessions()[0]?.eventCount).toBe(2);
  });

  it("records a capture gap as data the timeline can show", () => {
    service.recordHookPayload(
      {
        hook: "capture.gap",
        sessionID: "ses_gap",
        from: "2026-10-25T10:00:00.000Z",
        to: "2026-10-25T10:05:00.000Z",
        reason: "service unavailable",
      },
      new Date("2026-10-25T10:05:00.000Z"),
    );

    const [event] = store.listBySession("ses_gap");
    expect(event?.type).toBe("capture.gap");
    expect(event?.data).toEqual({
      capture_path: "plugin_hook",
      from: "2026-10-25T10:00:00.000Z",
      to: "2026-10-25T10:05:00.000Z",
      reason: "service unavailable",
    });
  });

  // Frozen from a live OpenCode run: an unmatched bash command is asked for,
  // and a non-interactive run auto-rejects it. Probe record in docs/probes/.
  it("records a live permission rejection as denied, not as an error", () => {
    expect(service.recordHookPayload(readFixture(DENIED_FIXTURE), RECEIVED_AT)).toBe("stored");

    const [event] = store.listBySession("ses_fixture_denied");
    expect(event?.type).toBe("hook.script");
    expect(event?.data).toEqual({
      hook: "tool.execute.after",
      target_tool: "bash",
      target: "curl -s https://example.test/",
      exit_code: null,
      outcome: "denied",
    });
  });

  it("orders two events with identical timestamps deterministically", () => {
    service.recordHookPayload(toolAfter("read", { filePath: "first.ts" }, "call_first"), RECEIVED_AT);
    service.recordHookPayload(toolAfter("read", { filePath: "second.ts" }, "call_second"), RECEIVED_AT);

    expect(service.getTimeline("ses_surface").map((entry) => entry.target)).toEqual(["first.ts", "second.ts"]);
  });

  it("stores the duration recorded on the hook payload", () => {
    service.recordHookPayload(readFixture(BASH_DURATION_FIXTURE), RECEIVED_AT);

    const [event] = store.listBySession("ses_e8cd974edffegftWNtrKV3BXUe");
    expect(event?.duration_ms).toBe(1234);
  });

  it("stores no duration when the payload carries none", () => {
    service.recordHookPayload(toolAfter("read", { filePath: "no-duration.ts" }, "call_no_duration"), RECEIVED_AT);

    const [event] = store.listBySession("ses_surface");
    expect(event?.duration_ms).toBeNull();
  });

  it("treats a negative or non-finite duration as unknown", () => {
    service.recordHookPayload(
      { ...toolAfter("read", { filePath: "negative.ts" }, "call_negative"), durationMs: -5 },
      RECEIVED_AT,
    );
    service.recordHookPayload(
      { ...toolAfter("read", { filePath: "nan.ts" }, "call_nan"), durationMs: Number.NaN },
      RECEIVED_AT,
    );

    expect(store.listBySession("ses_surface").map((event) => event.duration_ms)).toEqual([null, null]);
  });

  it("measures the elapsed time between the before and after hooks", async () => {
    const sent: unknown[] = [];
    const plugin = new TraceVaultPlugin(
      {
        forward: async (payload: unknown): Promise<void> => {
          sent.push(payload);
        },
      },
      new PendingGapStore(join(directory, "pending-gaps.json")),
      clockFrom([1000, 2234]),
    );

    await plugin.hooks()["tool.execute.before"](
      { tool: "bash", sessionID: "ses_measured", callID: "call_measured" },
      { args: { command: "echo timed" } },
    );
    await plugin.hooks()["tool.execute.after"](
      { tool: "bash", sessionID: "ses_measured", callID: "call_measured", args: { command: "echo timed" } },
      {},
    );

    const forwarded = sent.find((payload) => (payload as { hook?: string }).hook === "tool.execute.after");
    expect(forwarded).toMatchObject({ durationMs: 1234 });

    service.recordHookPayload(forwarded, RECEIVED_AT);
    expect(store.findByCorrelation("call_measured")?.duration_ms).toBe(1234);
  });

  it("measures a failed tool call that had a before hook", async () => {
    const sent: unknown[] = [];
    const plugin = new TraceVaultPlugin(
      {
        forward: async (payload: unknown): Promise<void> => {
          sent.push(payload);
        },
      },
      new PendingGapStore(join(directory, "pending-gaps.json")),
      clockFrom([500, 750]),
    );

    await plugin.hooks()["tool.execute.before"](
      { tool: "read", sessionID: "ses_failed_timed", callID: "call_failed_timed" },
      { args: { filePath: "x.ts" } },
    );
    await plugin.hooks().event({
      event: {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            tool: "read",
            callID: "call_failed_timed",
            sessionID: "ses_failed_timed",
            state: { status: "error", input: { filePath: "x.ts" }, error: "boom" },
          },
        },
      },
    });

    const forwarded = sent.find((payload) => (payload as { hook?: string }).hook === "tool.failed");
    expect(forwarded).toMatchObject({ durationMs: 250 });
    expect(store.listBySession("ses_failed_timed")).toHaveLength(0);
  });

  it("omits the duration for a failure with no before hook", async () => {
    const sent: unknown[] = [];
    const plugin = new TraceVaultPlugin(
      {
        forward: async (payload: unknown): Promise<void> => {
          sent.push(payload);
        },
      },
      new PendingGapStore(join(directory, "pending-gaps.json")),
      clockFrom([]),
    );

    await plugin.hooks().event({
      event: {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            tool: "read",
            callID: "call_failed_untimed",
            sessionID: "ses_failed_untimed",
            state: { status: "error", input: { filePath: "y.ts" }, error: "boom" },
          },
        },
      },
    });

    const forwarded = sent.find(
      (payload) => (payload as { hook?: string }).hook === "tool.failed",
    ) as Record<string, unknown>;
    expect("durationMs" in forwarded).toBe(false);

    service.recordHookPayload(forwarded, RECEIVED_AT);
    expect(store.listBySession("ses_failed_untimed")[0]?.duration_ms).toBeNull();
  });

  it("reads a row written before duration_ms existed as null", () => {
    const legacy = {
      id: "evt_legacy",
      schema_version: 1,
      session_id: "ses_legacy",
      agent: { name: "opencode", version: "unknown" },
      capture_path: "session_store",
      timestamp: "2026-10-25T10:00:00.000Z",
      seq: null,
      correlation_id: "session_store:legacy",
      prev_hash: "0".repeat(64),
      raw_extra: {},
      type: "hook.script",
      data: {
        hook: "tool.execute.after",
        target_tool: "bash",
        target: "echo legacy",
        exit_code: 0,
        outcome: "ok",
      },
    };
    const database = new DatabaseSync(join(directory, "events.db"));
    database
      .prepare(
        `INSERT INTO events (id, session_id, agent_name, type, timestamp, seq, capture_path, correlation_id, body, prev_hash, hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        legacy.id,
        legacy.session_id,
        legacy.agent.name,
        legacy.type,
        legacy.timestamp,
        legacy.seq,
        legacy.capture_path,
        legacy.correlation_id,
        JSON.stringify(legacy),
        legacy.prev_hash,
        "legacy-hash",
      );
    database.close();

    const [event] = store.listBySession("ses_legacy");
    expect(event?.duration_ms).toBeNull();
  });

  it("rejects a payload it cannot read without storing anything", () => {
    expect(service.recordHookPayload({}, RECEIVED_AT)).toBe("rejected");
    expect(store.listSessions()).toEqual([]);
  });

  it("keeps frozen fixtures free of credentials and real absolute paths", () => {
    const names = readdirSync(FIXTURE_DIRECTORY).filter((name) => name.endsWith(".json"));
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      const text = readFileSync(new URL(name, FIXTURE_DIRECTORY), "utf8");
      expect(text, name).not.toMatch(/[A-Za-z]:\\Users\\(?!example)/i);
      expect(text, name).not.toMatch(/\bsk-[A-Za-z0-9]{8,}/);
      expect(text, name).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{8,}/);
      expect(text, name).not.toMatch(/(api_key|password)["']?\s*[:=]\s*["'][^"']+/i);
    }
  });
});
