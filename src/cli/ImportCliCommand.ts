import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SqliteEventStore } from "../store/SqliteEventStore.js";
import type { CliCommand } from "./CliCommand.js";
import { CommandOptions } from "./CommandOptions.js";
import { HistoryImportCommand } from "./HistoryImportCommand.js";

/** `tracevault import`: copies the sessions already in the agent's own store into the database. */
export class ImportCliCommand implements CliCommand {
  readonly name = "import";
  readonly usageOnError = true;
  readonly usage = `  tracevault import [--db <path>]         import the agent's existing session history`;

  constructor(private readonly defaultDbPath: string) {}

  async run(args: readonly string[]): Promise<number> {
    const dbPath = CommandOptions.parse(args, { "--db": "file" })["--db"] ?? this.defaultDbPath;
    mkdirSync(dirname(dbPath), { recursive: true });
    const store = new SqliteEventStore(dbPath);
    try {
      process.stdout.write(`${new HistoryImportCommand().run(store)}\n`);
    } finally {
      store.close();
    }
    return 0;
  }
}
