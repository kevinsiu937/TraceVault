#!/usr/bin/env node
/**
 * TraceVault CLI entry point.
 *
 * Semester 1 commands:
 *   init        attach TraceVault to the local project (plugin hook)
 *   uninstall   remove TraceVault and restore the previous configuration
 *   harden      make the project's opencode.json ask before risky calls
 *   import      import every session already in the agent's own store
 *   run         start the local service (capture + scanners + dashboard on 127.0.0.1)
 *   report      write one session as a self-contained HTML report
 *   verify      check that the stored record has not been changed
 *
 * Only argument parsing and exit codes belong here. Behaviour lives in the
 * component modules so it can be tested without spawning a process.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { PluginConfig } from "../plugin/PluginConfig.js";
import { SqliteEventStore } from "../store/SqliteEventStore.js";
import { CommandOptions } from "./CommandOptions.js";
import { HardenCommand } from "./HardenCommand.js";
import { HistoryImportCommand } from "./HistoryImportCommand.js";
import { InitCommand } from "./InitCommand.js";
import { ReportCommand } from "./ReportCommand.js";
import { RunCommand } from "./RunCommand.js";
import { UninstallCommand } from "./UninstallCommand.js";
import { VerifyCommand } from "./VerifyCommand.js";

export const VERSION = "0.1.0";

const USAGE = `tracevault ${VERSION}

Usage:
  tracevault init [--dir <path>] [--block] [--no-harden] [--port <n>]
                                          attach TraceVault to a project and make its
                                          opencode.json ask before risky calls;
                                          --block refuses calls a blockable rule matches;
                                          --no-harden leaves opencode.json alone;
                                          --port is the port the service runs on, if not 4319
  tracevault uninstall [--dir <path>]     remove TraceVault and restore the configuration,
                                          including what init or harden changed
  tracevault harden [--dir <path>] [--undo]   make the project's opencode.json ask before
                                          risky calls; --undo puts the original back
  tracevault import [--db <path>]         import the agent's existing session history
  tracevault run [--port <n>] [--db <path>]   start the local service
  tracevault report <session-id> [--db <path>] --out <file> [--rules now|then]
                                          write one session as a self-contained HTML report,
                                          under today's rules or those from when it was recorded
  tracevault verify [--db <path>]         check that no stored event was changed or removed
  tracevault --version
  tracevault --help

Without --db, the database is tracevault/tracevault.db in your state folder
(~/.local/state, or %LOCALAPPDATA% on Windows), never the current folder.
`;

const DEFAULT_PORT = 4319;

type Command = "init" | "uninstall" | "harden" | "import" | "run" | "report" | "verify";

const COMMANDS: readonly Command[] = ["init", "uninstall", "harden", "import", "run", "report", "verify"];

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function main(argv: readonly string[]): Promise<number> {
  const options = new CommandOptions({
    port: DEFAULT_PORT,
    // Outside the project on purpose: a database in the working folder is one `git add .` from being published.
    dbPath: join(PluginConfig.stateDirectory(), "tracevault.db"),
    directory: process.cwd(),
    block: false,
    out: null,
    undo: false,
    rules: "now",
    harden: true,
  });
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

  if (first === "verify") {
    try {
      const { dbPath } = options.parse(argv.slice(1), ["--db"]);
      const { intact, summary } = new VerifyCommand().run(dbPath);
      process.stdout.write(`${summary}\n`);
      return intact ? 0 : 1;
    } catch (error) {
      process.stderr.write(`tracevault: ${errorMessage(error)}\n`);
      return 1;
    }
  }

  if (first === "harden") {
    try {
      const { directory, undo } = options.parse(argv.slice(1), ["--dir", "--undo"]);
      const command = new HardenCommand(directory);
      process.stdout.write(`${undo ? command.undo() : command.harden()}\n`);
      return 0;
    } catch (error) {
      process.stderr.write(`tracevault: ${errorMessage(error)}\n`);
      return 1;
    }
  }

  if (first === "init" || first === "uninstall") {
    try {
      const { directory, block, harden, port } = options.parse(argv.slice(1), first === "init" ? ["--dir", "--block", "--no-harden", "--port"] : ["--dir"]);
      const hardener = new HardenCommand(directory);
      const summary =
        first === "init"
          ? new InitCommand(directory, block, harden ? hardener : null, port).install()
          : new UninstallCommand(directory, hardener).uninstall();
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
    const { dbPath, out, rules } = options.parse(argv.slice(2), ["--db", "--out", "--rules"]);
    if (out === null) {
      throw new TypeError("report expects --out <file>");
    }
    process.stdout.write(`${new ReportCommand().run(sessionId, dbPath, out, rules)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`tracevault: ${errorMessage(error)}\n\n${USAGE}`);
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
