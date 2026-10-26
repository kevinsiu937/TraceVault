import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncInstance } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HookPayloadParser } from "../../src/capture/HookPayloadParser.js";
import { HistoryImport } from "../../src/capture/HistoryImport.js";
import { ImportedPartMapper } from "../../src/capture/ImportedPartMapper.js";
import { OpenCodeStoreSource } from "../../src/capture/OpenCodeStoreSource.js";
import { DenialSignal } from "../../src/capture/DenialSignal.js";
import { PayloadDigest } from "../../src/capture/PayloadDigest.js";
import { PluginHookCapture } from "../../src/capture/PluginHookCapture.js";
import { ToolClassifier } from "../../src/capture/ToolClassifier.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";
import { StoreVerifier } from "../../src/store/StoreVerifier.js";

const FIXTURE = fileURLToPath(new URL("../fixtures/opencode-store/opencode.db", import.meta.url));

// shortcut: Vitest's bundled Vite predates node:sqlite; Node's resolver loads it.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSyncInstance;
};

/** A temporary OpenCode-shaped store: one root session, one subagent child. */
function createAgentStore(path: string): void {
  const database = new DatabaseSync(path);
  try {
    database.exec(`
      CREATE TABLE session (
        id text PRIMARY KEY,
        parent_id text,
        slug text NOT NULL,
        directory text NOT NULL,
        title text NOT NULL,
        version text NOT NULL,
        agent text,
        time_created integer NOT NULL,
        time_updated integer NOT NULL
      );
      CREATE TABLE part (
        id text PRIMARY KEY,
        message_id text NOT NULL,
        session_id text NOT NULL,
        time_created integer NOT NULL,
        time_updated integer NOT NULL,
        data text NOT NULL
      );
    `);
    database
      .prepare(
        `INSERT INTO session (id, parent_id, slug, directory, title, version, agent, time_created, time_updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("ses_import_root", null, "root-slug", "C:/project", "Imported root", "1.18.25", "build", 1792900000000, 1792900001000);
    database
      .prepare(
        `INSERT INTO session (id, parent_id, slug, directory, title, version, agent, time_created, time_updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("ses_import_child", "ses_import_root", "child-slug", "C:/project", "Imported child (@Sisyphus-Junior subagent)", "1.18.25", "Sisyphus-Junior", 1792900002000, 1792900003000);

    const insertPart = database.prepare(
      `INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const [index, sessionId] of ["ses_import_root", "ses_import_child"].entries()) {
      insertPart.run(
        `prt_import_${index}`,
        `msg_import_${index}`,
        sessionId,
        1792900000000 + index * 2000,
        1792900000050 + index * 2000,
        JSON.stringify({
          type: "tool",
          tool: "bash",
          callID: `call_import_${index}`,
          state: {
            status: "completed",
            input: { command: "echo import" },
            output: "import",
            metadata: { exit: 0 },
            title: "echo import",
            time: { start: 1792900000000 + index * 2000, end: 1792900000050 + index * 2000 },
          },
        }),
      );
    }
  } finally {
    database.close();
  }
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("seam B: import the agent's own session store", () => {
  let directory: string;
  let store: SqliteEventStore;
  let source: OpenCodeStoreSource;
  let importer: HistoryImport;
  let service: InvestigationService;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-history-"));
    store = new SqliteEventStore(join(directory, "events.db"));
    source = new OpenCodeStoreSource(FIXTURE);
    const factory = new EventFactory("session_store");
    const classifier = new ToolClassifier(new PayloadDigest());
    importer = new HistoryImport(source, store, factory, new ImportedPartMapper(classifier, new DenialSignal()));
    service = new InvestigationService(
      new PluginHookCapture(new HookPayloadParser(), classifier, new EventFactory(), new DenialSignal()),
      store,
      new EventFactory(),
      new TimelineBuilder(),
    );
  });

  afterEach(() => {
    source.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("imports every fixture session and every tool part", () => {
    expect(importer.run()).toEqual({ sessions: 2, events: 15, skipped: 0 });
    expect(store.listAllOrdered()).toHaveLength(15);
  });

  it("maps a bash call, an edit, a read and an MCP call to the live vocabulary", () => {
    importer.run();

    expect(store.findByCorrelation("call_prt_fix_bash_ok")?.data).toEqual({
      hook: "tool.execute.after",
      target_tool: "bash",
      target: "echo fixture",
      exit_code: 0,
      outcome: "ok",
    });
    expect(store.findByCorrelation("call_prt_fix_bash_err")?.data).toMatchObject({
      target: "cmd /c exit 1",
      exit_code: 1,
      outcome: "error",
    });
    expect(store.findByCorrelation("call_prt_fix_read")).toMatchObject({
      type: "document.access",
      data: { path: "C:/Users/example/project/src/a.ts", operation: "read", outcome: "ok" },
    });
    expect(store.findByCorrelation("call_prt_fix_edit")).toMatchObject({
      type: "document.access",
      data: { path: "C:/Users/example/project/src/a.ts", operation: "write", outcome: "ok" },
    });
    expect(store.findByCorrelation("call_prt_fix_mcp")).toMatchObject({
      type: "mcp.call",
      data: { server: "context7", tool: "resolve-library-id", outcome: "ok" },
    });
    expect(store.findByCorrelation("call_prt_fix_read_error")?.data).toMatchObject({
      outcome: "error",
    });
  });

  it("stores each imported tool part's own start-to-end time as its duration", () => {
    importer.run();

    // Frozen fixture part rows: 1792918810000 → 1792918810025 and so on for every tool part.
    expect(store.findByCorrelation("call_prt_fix_bash_ok")?.duration_ms).toBe(25);
    expect(store.findByCorrelation("call_prt_fix_mcp")?.duration_ms).toBe(25);
    expect(store.findByCorrelation("call_prt_fix_read_error")?.duration_ms).toBe(25);
  });

  it("leaves imported patch events without a duration", () => {
    importer.run();

    const patchDurations = store
      .listBySession("ses_fixture_history")
      .filter((event) => event.correlation_id?.startsWith("session_store:prt_fix_patch"))
      .map((event) => event.duration_ms);

    expect(patchDurations).toEqual([null, null]);
  });

  it("turns a patch record into one document.access event per file", () => {
    importer.run();

    const targets = store
      .listBySession("ses_fixture_history")
      .filter((event) => event.correlation_id?.startsWith("session_store:prt_fix_patch"))
      .map((event) => (event.type === "document.access" ? event.data : null));

    expect(targets).toEqual([
      { path: "C:/Users/example/project/src/a.ts", operation: "write", outcome: "ok" },
      { path: "C:/Users/example/project/src/b.ts", operation: "write", outcome: "ok" },
    ]);
  });

  it("marks every imported event with the session_store capture path and no duplicates", () => {
    importer.run();

    const events = store.listAllOrdered().map((row) => row.event);
    expect(events.every((event) => event.capture_path === "session_store")).toBe(true);
    expect(events.filter((event) => event.type === "capture.duplicate")).toHaveLength(0);
    expect(new StoreVerifier(store).verify()).toEqual({ ok: true });
  });

  it("imports twice without adding a single row", () => {
    importer.run();
    const stored = store.listAllOrdered().length;

    expect(importer.run()).toEqual({ sessions: 0, events: 0, skipped: 15 });
    expect(store.listAllOrdered()).toHaveLength(stored);
  });

  it("shows imported title, agent, start and end in the session list", () => {
    importer.run();

    expect(service.listSessions()).toEqual([
      {
        sessionId: "ses_fixture_second",
        title: "Second session",
        agentName: "general",
        parentSessionId: null,
        startedAt: "2026-10-25T10:00:00.000Z",
        endedAt: "2026-10-25T10:01:00.000Z",
        eventCount: 1,
        gapCount: 0,
        filesTouched: 1,
        errorCount: 1,
        deniedCount: 0,
        lastOutcome: "error",
        density: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        durationMs: null,
      },
      {
        sessionId: "ses_fixture_history",
        title: "Fixture history",
        agentName: "build",
        parentSessionId: null,
        startedAt: "2026-10-25T09:00:00.000Z",
        endedAt: "2026-10-25T09:05:00.000Z",
        eventCount: 10,
        gapCount: 0,
        filesTouched: 2,
        errorCount: 1,
        deniedCount: 0,
        lastOutcome: "ok",
        density: [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 2, 1],
        durationMs: 80000,
      },
    ]);
  });

  it("does not double a session that was already captured live", () => {
    service.recordHookPayload(
      { hook: "session.created", sessionID: "ses_fixture_history", title: "Fixture history" },
      new Date("2026-10-25T09:00:00.000Z"),
    );
    service.recordHookPayload(
      {
        hook: "tool.execute.after",
        input: {
          tool: "bash",
          sessionID: "ses_fixture_history",
          callID: "call_prt_fix_bash_ok",
          args: { command: "echo fixture" },
        },
        output: { title: "echo fixture", metadata: { exit: 0 } },
      },
      new Date("2026-10-25T09:00:01.000Z"),
    );
    service.recordHookPayload(
      { hook: "session.idle", sessionID: "ses_fixture_history" },
      new Date("2026-10-25T09:05:00.000Z"),
    );

    importer.run();

    const stored = store.listBySession("ses_fixture_history").filter((event) => event.type !== "capture.duplicate");
    const bashTargets = stored.flatMap((event) => (event.type === "hook.script" ? [event.data.target] : []));
    expect(bashTargets.filter((target) => target === "echo fixture")).toHaveLength(1);
    expect(stored.filter((event) => event.type === "session.start")).toHaveLength(1);
    expect(stored.filter((event) => event.type === "session.end")).toHaveLength(1);
    expect(store.listBySession("ses_fixture_history").filter((event) => event.type === "capture.duplicate")).toHaveLength(0);
  });

  it("imports a child session's parent id onto its session.start event", () => {
    const agentDb = join(directory, "opencode.db");
    createAgentStore(agentDb);
    const agentSource = new OpenCodeStoreSource(agentDb);
    try {
      const classifier = new ToolClassifier(new PayloadDigest());
      new HistoryImport(
        agentSource,
        store,
        new EventFactory("session_store"),
        new ImportedPartMapper(classifier, new DenialSignal()),
      ).run();
    } finally {
      agentSource.close();
    }

    const childStart = store
      .listBySession("ses_import_child")
      .find((event) => event.type === "session.start");
    expect(childStart?.data).toEqual({
      title: "Imported child (@Sisyphus-Junior subagent)",
      parent_session_id: "ses_import_root",
    });

    const rootStart = store
      .listBySession("ses_import_root")
      .find((event) => event.type === "session.start");
    expect(rootStart?.data).toEqual({ title: "Imported root" });
  });

  it("leaves every source file byte-identical", () => {
    const before = hashFile(FIXTURE);

    importer.run();

    expect(hashFile(FIXTURE)).toBe(before);
    expect(existsSync(`${FIXTURE}-wal`)).toBe(false);
    expect(existsSync(`${FIXTURE}-shm`)).toBe(false);
  });
});
