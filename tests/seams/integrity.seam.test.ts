import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncInstance } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "../../src/cli/index.js";

import { EventFactory } from "../../src/schema/EventFactory.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";
import { StoreVerifier } from "../../src/store/StoreVerifier.js";

// shortcut: Vitest's bundled Vite predates node:sqlite; Node's resolver loads it.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSyncInstance;
};

const SESSION = "ses_integrity";
const GENESIS = "0".repeat(64);

describe("seam B: append-only integrity", () => {
  const factory = new EventFactory();
  let directory: string;
  let dbPath: string;
  let store: SqliteEventStore;
  let verifier: StoreVerifier;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-integrity-"));
    dbPath = join(directory, "events.db");
    store = new SqliteEventStore(dbPath);
    verifier = new StoreVerifier(store);

    [0, 1, 2].forEach((index) => {
      store.append(
        factory.fromClassified(
          {
            sessionId: SESSION,
            correlationId: `call_${index}`,
            receivedAt: new Date(`2026-10-25T10:0${index}:00.000Z`),
          },
          {
            type: "hook.script",
            data: {
              hook: "tool.execute.after",
              target_tool: "bash",
              target: `echo ${index}`,
              exit_code: 0,
              outcome: "ok",
            },
          },
        ),
      );
    });
  });

  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function withRawDatabase(run: (database: DatabaseSyncInstance) => void): void {
    const database = new DatabaseSync(dbPath);
    try {
      run(database);
    } finally {
      database.close();
    }
  }

  it("verifies a clean store with three appended events", () => {
    expect(verifier.verify()).toEqual({ ok: true });
  });

  it("links each row to the previous row's hash and starts at genesis", () => {
    const rows = store.listAllOrdered();

    expect(rows).toHaveLength(3);
    expect(rows[0]?.event.prev_hash).toBe(GENESIS);
    expect(rows[1]?.event.prev_hash).toBe(rows[0]?.hash);
    expect(rows[2]?.event.prev_hash).toBe(rows[1]?.hash);
    expect(store.listBySession(SESSION)[0]?.prev_hash).toBe(GENESIS);
  });

  it("fails at the edited position when an event body is rewritten directly in SQLite", () => {
    withRawDatabase((database) => {
      const row = database
        .prepare("SELECT rowid, body FROM events ORDER BY rowid ASC LIMIT 1 OFFSET 1")
        .get() as { rowid: number; body: string };
      const body = JSON.parse(row.body) as { data: { target: string } };
      body.data.target = "echo tampered";
      database.prepare("UPDATE events SET body = ? WHERE rowid = ?").run(JSON.stringify(body), row.rowid);
    });

    expect(verifier.verify()).toEqual({
      ok: false,
      sessionId: SESSION,
      position: 1,
      rowId: 2,
      reason: "hash-mismatch",
    });
  });

  it("fails at the first broken link when a middle event is deleted directly from SQLite", () => {
    withRawDatabase((database) => {
      database
        .prepare("DELETE FROM events WHERE rowid = (SELECT rowid FROM events ORDER BY rowid ASC LIMIT 1 OFFSET 1)")
        .run();
    });

    expect(verifier.verify()).toEqual({
      ok: false,
      sessionId: SESSION,
      position: 1,
      rowId: 3,
      reason: "broken-link",
    });
  });

  it("keeps one unbroken chain when several processes append at once", async () => {
    const viteNode = join(import.meta.dirname, "../../node_modules/vite-node/vite-node.mjs");
    const writer = join(import.meta.dirname, "integrity.writer.ts");
    const writers = ["a", "b", "c"].map((name) => {
      const child = spawn(process.execPath, [viteNode, writer, dbPath, name, "100"], { stdio: ["pipe", "pipe", "pipe"] });
      let errors = "";
      child.stderr.on("data", (chunk) => (errors += String(chunk)));
      return {
        child,
        ready: new Promise<void>((resolve) => child.stdout.once("data", () => resolve())),
        done: new Promise<string>((resolve) => child.once("exit", (code) => resolve(code === 0 ? "" : errors || `exit ${code}`))),
      };
    });

    // Every writer has the database open before any of them appends, so their appends interleave.
    await Promise.all(writers.map((writer) => writer.ready));
    writers.forEach((writer) => writer.child.stdin.end("go\n"));
    const failures = (await Promise.all(writers.map((writer) => writer.done))).filter((failure) => failure !== "");

    expect(failures).toEqual([]);
    expect(store.listAllOrdered()).toHaveLength(3 + 300);
    expect(verifier.verify()).toEqual({ ok: true });
  }, 30_000);

  describe("tracevault verify", () => {
    let output: string;

    beforeEach(() => {
      output = "";
      const capture = (chunk: unknown): boolean => {
        output += String(chunk);
        return true;
      };
      vi.spyOn(process.stdout, "write").mockImplementation(capture);
      vi.spyOn(process.stderr, "write").mockImplementation(capture);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("says an untouched record is intact", async () => {
      await expect(main(["verify", "--db", dbPath])).resolves.toBe(0);

      expect(output).toContain("the record is intact: 3 events");
    });

    it("names the session and the reason when a row was edited, and exits 1", async () => {
      withRawDatabase((database) => {
        database.prepare("UPDATE events SET body = replace(body, 'echo 1', 'echo tampered') WHERE rowid = 2").run();
      });

      await expect(main(["verify", "--db", dbPath])).resolves.toBe(1);

      expect(output).toContain(SESSION);
      expect(output).toContain("was changed after it was recorded");
    });

    it("still reports a row whose edit removed its session", async () => {
      withRawDatabase((database) => {
        database.prepare("UPDATE events SET body = replace(body, 'session_id', 'gone') WHERE rowid = 2").run();
      });

      await expect(main(["verify", "--db", dbPath])).resolves.toBe(1);

      expect(output).toContain("stored event 2 (session unreadable) was changed after it was recorded");
    });

    it("refuses a path that holds no database, without creating one", async () => {
      const missing = join(directory, "nothing.db");

      await expect(main(["verify", "--db", missing])).resolves.toBe(1);

      expect(output).toContain(`no database at ${missing}`);
      expect(existsSync(missing)).toBe(false);
    });
  });
});
