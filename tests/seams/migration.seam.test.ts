import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncInstance } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Event } from "../../src/schema/Event.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { CanonicalJson } from "../../src/store/CanonicalJson.js";
import { HashChain } from "../../src/store/HashChain.js";
import { SchemaMigrations } from "../../src/store/SchemaMigrations.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";
import { StoreVerifier } from "../../src/store/StoreVerifier.js";

// shortcut: Vitest's bundled Vite predates node:sqlite; Node's resolver loads it.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSyncInstance;
};

const SESSION = "ses_migration";

function shell(index: number): Event {
  return new EventFactory().fromClassified(
    { sessionId: SESSION, correlationId: `call_${index}`, receivedAt: new Date(`2026-10-25T10:0${index}:00.000Z`) },
    { type: "hook.script", data: { hook: "tool.execute.after", target_tool: "bash", target: `echo ${index}`, exit_code: 0, outcome: "ok" } },
  );
}

function raw<T>(path: string, run: (database: DatabaseSyncInstance) => T): T {
  const database = new DatabaseSync(path);
  try {
    return run(database);
  } finally {
    database.close();
  }
}

function version(path: string): number {
  return raw(path, (database) => Number((database.prepare("PRAGMA user_version").get() as { user_version: number }).user_version));
}

describe("seam B: a database keeps working across upgrades", () => {
  let directory: string;
  let dbPath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-migration-"));
    dbPath = join(directory, "events.db");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  /** A file as TraceVault wrote it before versioning: the same tables, three events, no version recorded. */
  function unversionedDatabase(): void {
    const store = new SqliteEventStore(dbPath);
    [0, 1, 2].forEach((index) => store.append(shell(index)));
    store.close();
    raw(dbPath, (database) => database.exec("PRAGMA user_version = 0"));
  }

  it("upgrades a database written before versioning, keeping every event and a valid chain", () => {
    unversionedDatabase();
    expect(version(dbPath)).toBe(0);

    const store = new SqliteEventStore(dbPath);
    try {
      expect(version(dbPath)).toBe(new SchemaMigrations().current);
      expect(store.listBySession(SESSION).map((event) => event.correlation_id)).toEqual(["call_0", "call_1", "call_2"]);
      expect(new StoreVerifier(store).verify()).toEqual({ ok: true });
    } finally {
      store.close();
    }
  });

  it("changes nothing when the same database is opened twice", () => {
    unversionedDatabase();
    new SqliteEventStore(dbPath).close();
    const schema = raw(dbPath, (database) => database.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY name").all());

    const store = new SqliteEventStore(dbPath);
    try {
      expect(raw(dbPath, (database) => database.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY name").all())).toEqual(schema);
      expect(version(dbPath)).toBe(new SchemaMigrations().current);
      expect(store.listAllOrdered()).toHaveLength(3);
    } finally {
      store.close();
    }
  });

  it("refuses a database from a newer TraceVault and leaves it byte for byte", () => {
    unversionedDatabase();
    const future = new SchemaMigrations().current + 1;
    raw(dbPath, (database) => database.exec(`PRAGMA user_version = ${future}`));
    const before = readFileSync(dbPath);

    expect(() => new SqliteEventStore(dbPath)).toThrow(new RegExp(`version ${future}.*newer than this TraceVault`));
    expect(readFileSync(dbPath).equals(before)).toBe(true);
  });

  it("verifies an event as stored while reading it back in the current shape", () => {
    new SqliteEventStore(dbPath).close();
    const chain = new HashChain(new CanonicalJson());
    // An event written before duration_ms existed: the stored body, and its hash, have no such field.
    const { duration_ms: _, ...old } = { ...shell(0), prev_hash: chain.genesis };
    raw(dbPath, (database) =>
      database
        .prepare(
          "INSERT INTO events (id, session_id, agent_name, type, timestamp, seq, capture_path, correlation_id, body, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(old.id, old.session_id, old.agent.name, old.type, old.timestamp, null, old.capture_path, old.correlation_id, JSON.stringify(old), old.prev_hash, chain.compute(chain.genesis, old as Event)),
    );

    const store = new SqliteEventStore(dbPath);
    try {
      expect(store.listBySession(SESSION)[0]?.duration_ms).toBeNull();
      expect(new StoreVerifier(store).verify()).toEqual({ ok: true });
    } finally {
      store.close();
    }
  });
});
