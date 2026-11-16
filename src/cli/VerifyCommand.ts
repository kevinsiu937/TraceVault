import { existsSync } from "node:fs";
import { SqliteEventStore } from "../store/SqliteEventStore.js";
import { StoreVerifier } from "../store/StoreVerifier.js";
import type { CliCommand } from "./CliCommand.js";
import { CommandOptions } from "./CommandOptions.js";

const REASONS = {
  "hash-mismatch": "was changed after it was recorded",
  "broken-link": "does not follow the event before it: an event was removed, or added out of turn",
} as const;

/** `tracevault verify`: checks that every stored event still follows from the one before it. It never creates a database. */
export class VerifyCommand implements CliCommand {
  readonly name = "verify";
  readonly usageOnError = false;
  readonly usage = `  tracevault verify [--db <path>]         check that no stored event was changed or removed`;

  constructor(private readonly defaultDbPath: string) {}

  async run(args: readonly string[]): Promise<number> {
    const { intact, summary } = this.check(CommandOptions.parse(args, { "--db": "file" })["--db"] ?? this.defaultDbPath);
    process.stdout.write(`${summary}\n`);
    return intact ? 0 : 1;
  }

  private check(dbPath: string): { readonly intact: boolean; readonly summary: string } {
    if (!existsSync(dbPath)) {
      throw new Error(`no database at ${dbPath}`);
    }
    const store = new SqliteEventStore(dbPath);
    try {
      const result = new StoreVerifier(store).verify();
      if (result.ok) {
        const events = store.listAllOrdered().length;
        return { intact: true, summary: `the record is intact: ${events} ${events === 1 ? "event" : "events"} in ${dbPath}` };
      }
      // The session is read from the stored body, which is the very thing that may have been edited.
      const where = typeof result.sessionId === "string" ? `number ${result.position + 1} of session ${result.sessionId}` : "session unreadable";
      return {
        intact: false,
        summary: `the record is NOT intact: stored event ${result.rowId} (${where}) ${REASONS[result.reason]}. Events before it check out; nothing after it was checked.`,
      };
    } finally {
      store.close();
    }
  }
}
