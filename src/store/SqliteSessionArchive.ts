import { createRequire } from "node:module";
import { basename, dirname, extname, join } from "node:path";
import type { DatabaseSync as DatabaseSyncInstance } from "node:sqlite";

import { CanonicalJson } from "./CanonicalJson.js";
import { HashChain } from "./HashChain.js";
import { SqliteEventStore } from "./SqliteEventStore.js";
import type { StoredArchiveRun } from "./StoredArchiveRun.js";

// shortcut: Vitest's bundled Vite predates node:sqlite; Node's resolver loads it.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSyncInstance;
};

const DAY_MS = 86_400_000;
const COLUMNS = "id, session_id, agent_name, type, timestamp, seq, capture_path, correlation_id, body, prev_hash, hash";
const MOVING = "session_id IN (SELECT value FROM json_each(?))";

/**
 * Moves whole sessions that ended long ago out of the events database into
 * the month's archive file beside it, in one transaction over both files.
 * Rows move unchanged; each file gains anchors that stand for the rows now in
 * the other, so both still verify. A session that is still open, or that holds
 * an MCP server's first tool list (tool-changed's baseline), stays.
 */
export class SqliteSessionArchive {
  constructor(
    private readonly dbPath: string,
    private readonly chain: HashChain = new HashChain(new CanonicalJson()),
  ) {}

  /** Moves the sessions that ended more than `afterDays` before `now`; 0 turns archiving off. Null when nothing moved. */
  archive(now: Date, afterDays: number): StoredArchiveRun | null {
    if (afterDays === 0) {
      return null;
    }
    const name = `${basename(this.dbPath, extname(this.dbPath))}-archive-${now.toISOString().slice(0, 7)}.db`;
    const path = join(dirname(this.dbPath), name);
    const database = new DatabaseSync(this.dbPath);
    try {
      database.exec("PRAGMA busy_timeout = 5000");
      const sessions = this.closedBefore(database, new Date(now.getTime() - afterDays * DAY_MS).toISOString());
      if (sessions.length === 0) {
        return null;
      }
      // Opening it as a store creates the archive and brings it to the current schema.
      new SqliteEventStore(path).close();
      database.prepare("ATTACH DATABASE ? AS archive").run(path);
      let events: number;
      try {
        events = this.move(database, sessions, name, now.toISOString());
      } finally {
        database.exec("DETACH DATABASE archive");
      }
      database.exec("VACUUM");
      return { ranAt: now.toISOString(), archive: name, sessions: sessions.length, events };
    } finally {
      database.close();
    }
  }

  /** Sessions whose last event is their end, before the cutoff, except those holding a server's first tool list or an accepted one. */
  private closedBefore(database: DatabaseSyncInstance, cutoff: string): string[] {
    return database
      .prepare(
        `SELECT session_id FROM events e1 GROUP BY session_id
         HAVING MAX(timestamp) < ?
            AND (SELECT type FROM events e2 WHERE e2.session_id = e1.session_id ORDER BY timestamp DESC, rowid DESC LIMIT 1) = 'session.end'
            AND session_id NOT IN (
              SELECT session_id FROM (
                SELECT session_id, ROW_NUMBER() OVER (PARTITION BY json_extract(body, '$.data.server') ORDER BY timestamp, id) AS n
                FROM events WHERE type = 'mcp.tools'
              ) WHERE n = 1)
            AND session_id NOT IN (SELECT e3.session_id FROM events e3 JOIN mcp_trust t ON t.event_id = e3.id)
         ORDER BY session_id`,
      )
      .all(cutoff)
      .map((row) => String(row["session_id"]));
  }

  private move(database: DatabaseSyncInstance, sessions: readonly string[], name: string, ranAt: string): number {
    const list = JSON.stringify(sessions);
    const moving = new Set(sessions);
    database.exec("BEGIN IMMEDIATE");
    try {
      const rows = database.prepare("SELECT session_id, prev_hash, hash FROM main.events ORDER BY rowid").all();
      const last = database.prepare("SELECT hash FROM archive.events ORDER BY rowid DESC LIMIT 1").get();
      const anchorMain = database.prepare("INSERT INTO main.chain_anchors (from_hash, to_hash) VALUES (?, ?)");
      const anchorArchive = database.prepare("INSERT INTO archive.chain_anchors (from_hash, to_hash) VALUES (?, ?)");
      let tail = last === undefined ? this.chain.genesis : String(last["hash"]);
      let runFrom: string | null = null;

      rows.forEach((row, index) => {
        if (!moving.has(String(row["session_id"]))) {
          return;
        }
        const prev = String(row["prev_hash"]);
        const hash = String(row["hash"]);
        // In the database, each run of consecutive moved rows becomes one anchor over it.
        runFrom ??= prev;
        const next = rows[index + 1];
        if (next === undefined || !moving.has(String(next["session_id"]))) {
          anchorMain.run(runFrom, hash);
          runFrom = null;
        }
        // In the archive, each jump over rows kept behind (or archived elsewhere) becomes an anchor.
        if (prev !== tail) {
          anchorArchive.run(tail, prev);
        }
        tail = hash;
      });

      database.prepare(`INSERT INTO archive.events (${COLUMNS}) SELECT ${COLUMNS} FROM main.events WHERE ${MOVING} ORDER BY rowid`).run(list);
      // The rules each session was recorded under travel with it, so the archive can still show "then".
      database.prepare(`INSERT OR IGNORE INTO archive.session_rules SELECT * FROM main.session_rules WHERE ${MOVING}`).run(list);
      database
        .prepare(`INSERT OR IGNORE INTO archive.rule_sets SELECT * FROM main.rule_sets WHERE digest IN (SELECT digest FROM main.session_rules WHERE ${MOVING})`)
        .run(list);
      database
        .prepare(
          `INSERT INTO main.archived_sessions (session_id, archive, events, archived_at)
           SELECT session_id, ?, COUNT(*), ? FROM main.events WHERE ${MOVING} GROUP BY session_id`,
        )
        .run(name, ranAt, list);
      const moved = Number(database.prepare(`DELETE FROM main.events WHERE ${MOVING}`).run(list).changes);
      database.prepare(`DELETE FROM main.session_rules WHERE ${MOVING}`).run(list);
      database.exec("COMMIT");
      return moved;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}
