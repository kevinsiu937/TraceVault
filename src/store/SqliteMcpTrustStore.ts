import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncInstance } from "node:sqlite";
import type { McpAcceptance, McpTrustPort } from "./McpTrustPort.js";

// shortcut: Vitest's bundled Vite predates node:sqlite; Node's resolver loads it.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSyncInstance;
};

/**
 * Acceptances of MCP tool lists, in the events database, outside the hash
 * chain: an acceptance is the developer's decision, not evidence of what an
 * agent did. The events database's migrations create the table; a short
 * connection per call, as these are rare.
 */
export class SqliteMcpTrustStore implements McpTrustPort {
  constructor(private readonly dbPath: string) {}

  accept(acceptance: McpAcceptance): void {
    this.run((database) =>
      database.prepare("INSERT INTO mcp_trust (server, event_id, digest, accepted_at) VALUES (?, ?, ?, ?)").run(acceptance.server, acceptance.eventId, acceptance.digest, acceptance.acceptedAt),
    );
  }

  list(): McpAcceptance[] {
    return this.run((database) => database.prepare("SELECT server, event_id, digest, accepted_at FROM mcp_trust ORDER BY rowid").all()).map((row) => ({
      server: String(row["server"]),
      eventId: String(row["event_id"]),
      digest: String(row["digest"]),
      acceptedAt: String(row["accepted_at"]),
    }));
  }

  private run<T>(work: (database: DatabaseSyncInstance) => T): T {
    const database = new DatabaseSync(this.dbPath);
    try {
      return work(database);
    } finally {
      database.close();
    }
  }
}
