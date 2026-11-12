#!/usr/bin/env node
/**
 * TraceVault CLI entry point.
 *
 * Semester 1 commands:
 *   init        attach TraceVault to the local project (plugin hook)
 *   uninstall   remove TraceVault and restore the previous configuration
 *   import      import every session already in the agent's own store
 *   run         start the local service (capture + scanners + dashboard on 127.0.0.1)
 *   report      write one session as a self-contained HTML report
 *
 * Only argument parsing and exit codes belong here. Behaviour lives in the
 * component modules so it can be tested without spawning a process.
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { SqliteEventStore } from "../store/SqliteEventStore.js";
import { CommandOptions } from "./CommandOptions.js";
import { HistoryImportCommand } from "./HistoryImportCommand.js";
import { InitCommand } from "./InitCommand.js";
import { ReportCommand } from "./ReportCommand.js";
import { RunCommand } from "./RunCommand.js";
import { UninstallCommand } from "./UninstallCommand.js";

export const VERSION = "0.1.0";

const USAGE = `tracevault ${VERSION}

Usage:
  tracevault init [--dir <path>] [--block]   attach TraceVault to a project;
                                          --block refuses calls a blockable rule matches
  tracevault uninstall [--dir <path>]     remove TraceVault and restore the configuration
  tracevault import [--db <path>]         import the agent's existing session history
  tracevault run [--port <n>] [--db <path>]   start the local service
  tracevault report <session-id> [--db <path>] --out <file>
                                          write one session as a self-contained HTML report
  tracevault --version
  tracevault --help
`;

const DEFAULT_PORT = 4319;
const DEFAULT_DB = "data/tracevault.db";

type Command = "init" | "uninstall" | "import" | "run" | "report";

const COMMANDS: readonly Command[] = ["init", "uninstall", "import", "run", "report"];

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function main(argv: readonly string[]): Promise<number> {
  const options = new CommandOptions({ port: DEFAULT_PORT, dbPath: DEFAULT_DB, directory: process.cwd(), block: false, out: null });
  const first = argv[0];

  if (first === "--version" || first === "-v") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (first === undefined || first === "--help" || first === "-h") {
    process.stdout.write(USAGE);
    return first === undefined ? 1 : 0;
  }

  if (!isCommand(first)) {
    process.stderr.write(`tracevault: unknown command '${first}'\n\n${USAGE}`);
    return 1;
  }

  if (first === "import") {
    try {
      const { dbPath } = options.parse(argv.slice(1), ["--db"]);
      mkdirSync(dirname(dbPath), { recursive: true });
      const store = new SqliteEventStore(dbPath);
      try {
        process.stdout.write(`${new HistoryImportCommand().run(store)}\n`);
      } finally {
        store.close();
      }
      return 0;
    } catch (error) {
      process.stderr.write(`tracevault: ${errorMessage(error)}\n\n${USAGE}`);
      return 1;
    }
  }

  if (first === "run") {
    try {
      const { port, dbPath } = options.parse(argv.slice(1), ["--port", "--db"]);
      return await new RunCommand().run(port, dbPath);
    } catch (error) {
      process.stderr.write(`tracevault: ${errorMessage(error)}\n\n${USAGE}`);
      return 1;
    }
  }

  if (first === "init" || first === "uninstall") {
    try {
      const { directory, block } = options.parse(argv.slice(1), first === "init" ? ["--dir", "--block"] : ["--dir"]);
      const summary =
        first === "init"
          ? new InitCommand(directory, block).install()
          : new UninstallCommand(directory).uninstall();
      process.stdout.write(`${summary}\n`);
      return 0;
    } catch (error) {
      process.stderr.write(`tracevault: ${errorMessage(error)}\n\n${USAGE}`);
      return 1;
    }
  }

  try {
    const sessionId = argv[1];
    if (sessionId === undefined || sessionId.startsWith("-")) {
      throw new TypeError("report expects a session id");
    }
    const { dbPath, out } = options.parse(argv.slice(2), ["--db", "--out"]);
    if (out === null) {
      throw new TypeError("report expects --out <file>");
    }
    process.stdout.write(`${new ReportCommand().run(sessionId, dbPath, out)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`tracevault: ${errorMessage(error)}\n\n${USAGE}`);
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
