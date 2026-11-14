import type { DatabaseSync } from "node:sqlite";

/**
 * The database's shape, one migration per version, in order. SQLite's
 * `user_version` records how many have run. A migration may add tables,
 * columns or indexes; it never updates or deletes an event row, because the
 * hash chain covers every stored body.
 */
const MIGRATIONS: readonly string[] = [
  // 1: the original table, written IF NOT EXISTS so a file from before versioning becomes version 1 unchanged.
  `CREATE TABLE IF NOT EXISTS events (
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
   CREATE INDEX IF NOT EXISTS idx_events_correlation ON events (correlation_id);`,
  // 2: every rule set the service has used, by digest, and the one current when each session was first recorded.
  `CREATE TABLE IF NOT EXISTS rule_sets (digest TEXT PRIMARY KEY, files TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS session_rules (session_id TEXT PRIMARY KEY, digest TEXT NOT NULL);`,
];

export class SchemaMigrations {
  constructor(private readonly migrations: readonly string[] = MIGRATIONS) {}

  get current(): number {
    return this.migrations.length;
  }

  /**
   * Brings an open database up to the current version in one transaction.
   * A newer file is refused before anything is written.
   */
  apply(database: DatabaseSync, path: string): void {
    const found = Number((database.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
    if (found > this.current) {
      throw new Error(`${path} has schema version ${found}, newer than this TraceVault understands (${this.current}); upgrade TraceVault to open it`);
    }
    if (found === this.current) {
      return;
    }
    database.exec("BEGIN");
    try {
      for (const migration of this.migrations.slice(found)) {
        database.exec(migration);
      }
      database.exec(`PRAGMA user_version = ${this.current}`);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}
