import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { CliCommand } from "./CliCommand.js";
import { CommandOptions } from "./CommandOptions.js";
import { HistoryImportCommand } from "./HistoryImportCommand.js";
import { ServiceAssembly } from "./ServiceAssembly.js";

const DEFAULT_PORT = 4319;

/** `tracevault run`: assembles the local service (capture, scanners, dashboard) and starts it on 127.0.0.1. */
export class RunCommand implements CliCommand {
  readonly name = "run";
  readonly usageOnError = true;
  readonly usage = `  tracevault run [--port <n>] [--db <path>]   start the local service`;

  constructor(private readonly defaultDbPath: string) {}

  async run(args: readonly string[]): Promise<number> {
    const flags = CommandOptions.parse(args, { "--port": "port", "--db": "file" });
    const port = Number(flags["--port"] ?? DEFAULT_PORT);
    const dbPath = flags["--db"] ?? this.defaultDbPath;
    let assembly: ServiceAssembly;
    try {
      assembly = new ServiceAssembly();
    } catch (error) {
      process.stderr.write(`tracevault: cannot load rules: ${this.message(error)}\n`);
      return 1;
    }
    mkdirSync(dirname(dbPath), { recursive: true });
    const { store, server } = assembly.open(dbPath);

    let importLine: string;
    try {
      importLine = new HistoryImportCommand().run(store);
    } catch (error) {
      importLine = `history import skipped: ${this.message(error)}`;
    }

    try {
      const listening = await server.listen(port);
      process.stdout.write(`${importLine}\ntracevault listening on http://127.0.0.1:${listening}\nevents db: ${dbPath}\n`);
      return 0;
    } catch (error) {
      store.close();
      if (typeof error === "object" && error !== null && "code" in error && error.code === "EADDRINUSE") {
        process.stderr.write(`tracevault: port ${port} is already in use\n`);
        return 1;
      }
      process.stderr.write(`tracevault: failed to start: ${this.message(error)}\n`);
      return 1;
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
