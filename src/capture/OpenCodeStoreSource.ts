import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncInstance } from "node:sqlite";

import type {
  AgentPartRecord,
  AgentSessionRecord,
  SessionStoreSource,
} from "./SessionStoreSource.js";

// shortcut: Vitest's bundled Vite predates node:sqlite; Node's resolver loads it.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => DatabaseSyncInstance;
};

export class OpenCodeStoreSource implements SessionStoreSource {
  private database: DatabaseSyncInstance | null = null;

  constructor(private readonly dbPath: string) {}

  isAvailable(): boolean {
    return existsSync(this.dbPath);
  }

  listSessions(): AgentSessionRecord[] {
    const database = this.connect();
    if (database === null) {
      return [];
    }

    const rows = database
      .prepare(
        `SELECT id, title, agent, time_created, time_updated
         FROM session ORDER BY time_created ASC, id ASC`,
      )
      .all();

    return rows.map((row) => ({
      id: this.asString(row["id"], "id"),
      title: this.asString(row["title"], "title"),
      agent: this.asNullableString(row["agent"]),
      createdAt: this.asDate(row["time_created"], "time_created"),
      updatedAt: this.asDate(row["time_updated"], "time_updated"),
    }));
  }

  listParts(sessionId: string): AgentPartRecord[] {
    const database = this.connect();
    if (database === null) {
      return [];
    }

    const rows = database
      .prepare(
        `SELECT id, session_id, time_created, data FROM part
         WHERE session_id = ? AND json_extract(data, '$.type') IN ('tool', 'patch')
         ORDER BY time_created ASC, rowid ASC`,
      )
      .all(sessionId);

    return rows.map((row) => ({
      id: this.asString(row["id"], "id"),
      sessionId: this.asString(row["session_id"], "session_id"),
      createdAt: this.asDate(row["time_created"], "time_created"),
      data: this.asRecord(row["data"]),
    }));
  }

  close(): void {
    this.database?.close();
    this.database = null;
  }

  private connect(): DatabaseSyncInstance | null {
    if (this.database !== null) {
      return this.database;
    }
    if (!this.isAvailable()) {
      return null;
    }
    this.database = new DatabaseSync(this.dbPath, { readOnly: true });
    return this.database;
  }

  private asString(value: unknown, field: string): string {
    if (typeof value !== "string") {
      throw new TypeError(`${field} is not a string`);
    }
    return value;
  }

  private asNullableString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  private asDate(value: unknown, field: string): Date {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`${field} is not a timestamp`);
    }
    return new Date(value);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== "string") {
      return {};
    }
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  }
}
