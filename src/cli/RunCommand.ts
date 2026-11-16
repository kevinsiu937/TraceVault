import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ShellProxy } from "../capture/ShellProxy.js";
import type { CliCommand } from "./CliCommand.js";
import { CommandOptions } from "./CommandOptions.js";
import { HistoryImportCommand } from "./HistoryImportCommand.js";
import { SqliteSessionArchive } from "../store/SqliteSessionArchive.js";
import { ServiceAssembly } from "./ServiceAssembly.js";

const DEFAULT_PORT = 4319;
const DEFAULT_ARCHIVE_AFTER_DAYS = 90;

/** `tracevault run`: assembles the local service (capture, scanners, dashboard) and starts it on 127.0.0.1, with the shell proxy on the next port. */
export class RunCommand implements CliCommand {
  readonly name = "run";
  readonly usageOnError = true;
  readonly usage = `  tracevault run [--port <n>] [--db <path>] [--archive-after <days>]
                                          start the local service; first move sessions that
                                          ended more than <days> ago (90; 0 = never) to an archive`;

  constructor(private readonly defaultDbPath: string) {}

  async run(args: readonly string[]): Promise<number> {
    const flags = CommandOptions.parse(args, { "--port": "port", "--db": "file", "--archive-after": "days" });
    const port = Number(flags["--port"] ?? DEFAULT_PORT);
    const archiveAfter = Number(flags["--archive-after"] ?? DEFAULT_ARCHIVE_AFTER_DAYS);
    const dbPath = flags["--db"] ?? this.defaultDbPath;
    let assembly: ServiceAssembly;
    try {
      assembly = new ServiceAssembly();
    } catch (error) {
      process.stderr.write(`tracevault: cannot load rules: ${this.message(error)}\n`);
      return 1;
    }
    mkdirSync(dirname(dbPath), { recursive: true });
    const { store, server, proxy } = assembly.open(dbPath);

    // Before the import, which skips archived sessions, so nothing moved here comes straight back.
    let archiveLine: string;
    try {
      const archived = new SqliteSessionArchive(dbPath).archive(new Date(), archiveAfter);
      archiveLine = archived === null ? "archive: nothing to move" : `archive: ${archived.sessions} session(s), ${archived.events} events, moved to ${archived.archive}`;
    } catch (error) {
      archiveLine = `archive skipped: ${this.message(error)}`;
    }

    let importLine: string;
    try {
      importLine = new HistoryImportCommand().run(store);
    } catch (error) {
      importLine = `history import skipped: ${this.message(error)}`;
    }

    try {
      const listening = await server.listen(port);
      const proxyLine = await this.startProxy(proxy, listening + 1);
      process.stdout.write(`${archiveLine}\n${importLine}\ntracevault listening on http://127.0.0.1:${listening}\n${proxyLine}\nevents db: ${dbPath}\n`);
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

  /** The service runs without the proxy rather than not at all: the shell then connects directly, unwatched. */
  private async startProxy(proxy: ShellProxy, port: number): Promise<string> {
    try {
      return `shell proxy on http://127.0.0.1:${await proxy.listen(port)}`;
    } catch (error) {
      const inUse = typeof error === "object" && error !== null && "code" in error && error.code === "EADDRINUSE";
      return `shell proxy not started: ${inUse ? `port ${port} is already in use` : this.message(error)}`;
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
