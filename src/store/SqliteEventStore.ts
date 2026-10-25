import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncInstance } from "node:sqlite";

import type { Event } from "../schema/Event.js";
import { CanonicalJson } from "./CanonicalJson.js";
import type { EventQuery } from "./EventQuery.js";
import { EventQuerySql } from "./EventQuerySql.js";
import type { EventStorePort } from "./EventStorePort.js";
import { HashChain } from "./HashChain.js";
import type { StoredSession } from "./StoredSession.js";

// shortcut: Vitest's bundled Vite predates node:sqlite; Node's resolver loads it.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSyncInstance;
};

const ACTIVITY_FILTER = "type NOT IN ('session.start','session.end','capture.gap','capture.duplicate')";

export class SqliteEventStore implements EventStorePort {
  private readonly database: DatabaseSyncInstance;
  private readonly chain: HashChain;
  private readonly querySql = new EventQuerySql();

  constructor(dbPath: string, chain: HashChain = new HashChain(new CanonicalJson())) {
    this.database = new DatabaseSync(dbPath);
    this.chain = chain;
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id             TEXT PRIMARY KEY,
        session_id     TEXT NOT NULL,
        agent_name     TEXT NOT NULL,
        type           TEXT NOT NULL,
        timestamp      TEXT NOT NULL,
        seq            INTEGER,
        capture_path   TEXT NOT NULL,
        correlation_id TEXT,
        body           TEXT NOT NULL,
        prev_hash      TEXT NOT NULL,
        hash           TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events (session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_correlation ON events (correlation_id);
    `);
  }

  append(event: Event): void {
    const previous = this.database.prepare("SELECT hash FROM events ORDER BY rowid DESC LIMIT 1").get();
    const prevHash = previous === undefined ? this.chain.genesis : this.asString(previous["hash"], "hash");
    const chained: Event = { ...event, prev_hash: prevHash };
    const hash = this.chain.compute(prevHash, chained);

    this.database
      .prepare(
        `INSERT INTO events (id, session_id, agent_name, type, timestamp, seq, capture_path, correlation_id, body, prev_hash, hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        chained.id,
        chained.session_id,
        chained.agent.name,
        chained.type,
        chained.timestamp,
        chained.seq,
        chained.capture_path,
        chained.correlation_id,
        JSON.stringify(chained),
        prevHash,
        hash,
      );
  }

  listBySession(sessionId: string): Event[] {
    const rows = this.database
      .prepare(
        `SELECT body FROM events WHERE session_id = ?
         ORDER BY timestamp ASC, seq ASC, capture_path ASC, rowid ASC`,
      )
      .all(sessionId);

    return rows.map((row) => this.parseBody(row["body"]));
  }

  listMatching(query: EventQuery): Event[] {
    const filter = this.querySql.where(query);
    const rows = this.database
      .prepare(
        `SELECT body FROM events ${filter.clause}
         ORDER BY timestamp ASC, seq ASC, capture_path ASC, rowid ASC`,
      )
      .all(...filter.parameters);

    return rows.map((row) => this.parseBody(row["body"]));
  }

  hasSession(sessionId: string): boolean {
    const row = this.database
      .prepare("SELECT 1 AS present FROM events WHERE session_id = ? LIMIT 1")
      .get(sessionId);
    return row !== undefined;
  }

  listSessions(): StoredSession[] {
    const rows = this.database
      .prepare(
        `SELECT session_id,
                MAX(agent_name) AS agent_name,
                MIN(timestamp)  AS started_at,
                MAX(timestamp)  AS last_at,
                (SELECT type FROM events e2
                  WHERE e2.session_id = e1.session_id
                  ORDER BY timestamp DESC, rowid DESC LIMIT 1) AS last_type,
                COALESCE((SELECT json_extract(e3.body, '$.data.title') FROM events e3
                  WHERE e3.session_id = e1.session_id AND e3.type = 'session.start'
                    AND json_extract(e3.body, '$.data.title') IS NOT NULL
                  ORDER BY timestamp DESC, rowid DESC LIMIT 1), '') AS title,
                SUM(CASE WHEN ${ACTIVITY_FILTER} THEN 1 ELSE 0 END) AS event_count
         FROM events e1
         GROUP BY session_id
         ORDER BY started_at DESC, session_id DESC`,
      )
      .all();

    return rows.map((row) => {
      const eventCount = row["event_count"];
      if (typeof eventCount !== "number") {
        throw new TypeError("event_count is not a number");
      }
      return {
        sessionId: this.asString(row["session_id"], "session_id"),
        title: this.asString(row["title"], "title"),
        agentName: this.asString(row["agent_name"], "agent_name"),
        startedAt: this.asString(row["started_at"], "started_at"),
        lastAt: this.asString(row["last_at"], "last_at"),
        lastType: this.asString(row["last_type"], "last_type"),
        eventCount,
      };
    });
  }

  listAllOrdered(): { rowId: number; event: Event; hash: string }[] {
    const rows = this.database
      .prepare("SELECT rowid AS row_id, body, hash FROM events ORDER BY rowid ASC")
      .all();

    return rows.map((row) => {
      const rowId = row["row_id"];
      if (typeof rowId !== "number") {
        throw new TypeError("row_id is not a number");
      }
      return {
        rowId,
        event: this.parseBody(row["body"]),
        hash: this.asString(row["hash"], "hash"),
      };
    });
  }

  findByCorrelation(correlationId: string): Event | null {
    const row = this.database
      .prepare("SELECT body FROM events WHERE correlation_id = ? ORDER BY rowid ASC LIMIT 1")
      .get(correlationId);
    return row === undefined ? null : this.parseBody(row["body"]);
  }

  close(): void {
    this.database.close();
  }

  private parseBody(value: unknown): Event {
    if (typeof value !== "string") {
      throw new TypeError("stored event body is not a string");
    }
    return JSON.parse(value) as Event;
  }

  private asString(value: unknown, field: string): string {
    if (typeof value !== "string") {
      throw new TypeError(`${field} is not a string`);
    }
    return value;
  }
}
