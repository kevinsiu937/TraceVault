import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

    expect(store.findByCorrelation("session_store:prt_fix_bash_ok")?.data).toEqual({
      hook: "tool.execute.after",
      target_tool: "bash",
      target: "echo fixture",
      exit_code: 0,
      outcome: "ok",
    });
    expect(store.findByCorrelation("session_store:prt_fix_bash_err")?.data).toMatchObject({
      target: "cmd /c exit 1",
      exit_code: 1,
      outcome: "error",
    });
    expect(store.findByCorrelation("session_store:prt_fix_read")).toMatchObject({
      type: "document.access",
      data: { path: "C:/Users/example/project/src/a.ts", operation: "read", outcome: "ok" },
    });
    expect(store.findByCorrelation("session_store:prt_fix_edit")).toMatchObject({
      type: "document.access",
      data: { path: "C:/Users/example/project/src/a.ts", operation: "write", outcome: "ok" },
    });
    expect(store.findByCorrelation("session_store:prt_fix_mcp")).toMatchObject({
      type: "mcp.call",
      data: { server: "context7", tool: "resolve-library-id", outcome: "ok" },
    });
    expect(store.findByCorrelation("session_store:prt_fix_read_error")?.data).toMatchObject({
      outcome: "error",
    });
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
        startedAt: "2026-10-25T10:00:00.000Z",
        endedAt: "2026-10-25T10:01:00.000Z",
        eventCount: 1,
      },
      {
        sessionId: "ses_fixture_history",
        title: "Fixture history",
        agentName: "build",
        startedAt: "2026-10-25T09:00:00.000Z",
        endedAt: "2026-10-25T09:05:00.000Z",
        eventCount: 10,
      },
    ]);
  });

  it("leaves every source file byte-identical", () => {
    const before = hashFile(FIXTURE);

    importer.run();

    expect(hashFile(FIXTURE)).toBe(before);
    expect(existsSync(`${FIXTURE}-wal`)).toBe(false);
    expect(existsSync(`${FIXTURE}-shm`)).toBe(false);
  });
});
