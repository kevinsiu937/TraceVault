import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncInstance } from "node:sqlite";

// shortcut: Vitest's bundled Vite predates node:sqlite; Node's resolver loads it.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSyncInstance;
};

/** Rule files by path, as their bytes read when the rule set was in use. */
export type RuleFiles = Readonly<Record<string, string>>;

/**
 * The rule sets a database has seen, and the one each session was first
 * recorded under. It shares the events database, whose migrations create its
 * tables, and opens a short connection per call: these are rare writes and
 * reads, and nothing has to close it.
 */
export class SqliteRuleSetStore {
  constructor(private readonly dbPath: string) {}

  /** Keeps the first copy of a rule set; the same digest always holds the same files. */
  save(digest: string, files: RuleFiles): void {
    this.run((database) => database.prepare("INSERT OR IGNORE INTO rule_sets (digest, files) VALUES (?, ?)").run(digest, JSON.stringify(files)));
  }

  load(digest: string): RuleFiles | null {
    const row = this.run((database) => database.prepare("SELECT files FROM rule_sets WHERE digest = ?").get(digest));
    return row === undefined ? null : (JSON.parse(String(row["files"])) as RuleFiles);
  }

  /** Records the rule set a session started under; a later call for the same session changes nothing. */
  recordSession(sessionId: string, digest: string): void {
    this.run((database) => database.prepare("INSERT OR IGNORE INTO session_rules (session_id, digest) VALUES (?, ?)").run(sessionId, digest));
  }

  sessionDigest(sessionId: string): string | null {
    const row = this.run((database) => database.prepare("SELECT digest FROM session_rules WHERE session_id = ?").get(sessionId));
    return row === undefined ? null : String(row["digest"]);
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
