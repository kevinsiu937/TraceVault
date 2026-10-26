#!/usr/bin/env node
/**
 * TraceVault CLI entry point.
 *
 * Semester 1 commands:
 *   init        attach TraceVault to the local project (plugin hook)
 *   uninstall   remove TraceVault and restore the previous configuration
 *   import      import every session already in the agent's own store
 *   run         start the local service (capture + scanners + dashboard on 127.0.0.1)
 *   report      produce a report from stored events
 *
 * Only argument parsing and exit codes belong here. Behaviour lives in the
 * component modules so it can be tested without spawning a process.
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { DenialSignal } from "../capture/DenialSignal.js";
import { HistoryImport } from "../capture/HistoryImport.js";
import { HookPayloadParser } from "../capture/HookPayloadParser.js";
import { ImportedPartMapper } from "../capture/ImportedPartMapper.js";
import { OpenCodeStoreSource } from "../capture/OpenCodeStoreSource.js";
import { PayloadDigest } from "../capture/PayloadDigest.js";
import { ToolClassifier } from "../capture/ToolClassifier.js";
import { PluginHookCapture } from "../capture/PluginHookCapture.js";
import { ActivityView } from "../dashboard/ActivityView.js";
import { DashboardServer } from "../dashboard/DashboardServer.js";
import { DetailPaneView } from "../dashboard/DetailPaneView.js";
import { SessionHeaderView } from "../dashboard/SessionHeaderView.js";
import { SessionListView } from "../dashboard/SessionListView.js";
import { SessionPageView } from "../dashboard/SessionPageView.js";
import { FileRailView } from "../dashboard/FileRailView.js";
import { GraphView } from "../dashboard/GraphView.js";import { WaterfallView } from "../dashboard/WaterfallView.js";
import { SubagentPortalView } from "../dashboard/SubagentPortalView.js";
import { TimelineView } from "../dashboard/TimelineView.js";
import { EventFactory } from "../schema/EventFactory.js";
import { InvestigationService } from "../service/InvestigationService.js";
import { TimelineBuilder } from "../service/TimelineBuilder.js";
import type { EventStorePort } from "../store/EventStorePort.js";
import { SqliteEventStore } from "../store/SqliteEventStore.js";
import { InitCommand } from "./InitCommand.js";
import { UninstallCommand } from "./UninstallCommand.js";

export const VERSION = "0.1.0";

const USAGE = `tracevault ${VERSION}

Usage:
  tracevault init [--dir <path>]          attach TraceVault to a project
  tracevault uninstall [--dir <path>]     remove TraceVault and restore the configuration
  tracevault import [--db <path>]         import the agent's existing session history
  tracevault run [--port <n>] [--db <path>]   start the local service
  tracevault report [--session <id>]   generate a report
  tracevault --version
  tracevault --help
`;

const DEFAULT_PORT = 4319;
const DEFAULT_DB = "data/tracevault.db";
const OPENCODE_STORE = join(".local", "share", "opencode", "opencode.db");

type Command = "init" | "uninstall" | "import" | "run" | "report";

const COMMANDS: readonly Command[] = ["init", "uninstall", "import", "run", "report"];

interface RunOptions {
  port: number;
  dbPath: string;
}

interface ImportOptions {
  dbPath: string;
}

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

function parseRunOptions(args: readonly string[]): RunOptions {
  let port = DEFAULT_PORT;
  let dbPath = DEFAULT_DB;
  const pending = [...args];

  while (pending.length > 0) {
    const flag = pending.shift();
    if (flag === undefined) {
      break;
    }

    if (flag === "--port") {
      const value = pending.shift();
      const parsed = value === undefined ? Number.NaN : Number(value);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
        throw new TypeError(`--port expects an integer between 0 and 65535, got '${value ?? ""}'`);
      }
      port = parsed;
      continue;
    }

    if (flag === "--db") {
      const value = pending.shift();
      if (value === undefined || value === "") {
        throw new TypeError("--db expects a file path");
      }
      dbPath = value;
      continue;
    }

    throw new TypeError(`unknown option '${flag}'`);
  }

  return { port, dbPath };
}

function parseImportOptions(args: readonly string[]): ImportOptions {
  let dbPath = DEFAULT_DB;
  const pending = [...args];

  while (pending.length > 0) {
    const flag = pending.shift();
    if (flag === undefined) {
      break;
    }

    if (flag === "--db") {
      const value = pending.shift();
      if (value === undefined || value === "") {
        throw new TypeError("--db expects a file path");
      }
      dbPath = value;
      continue;
    }

    throw new TypeError(`unknown option '${flag}'`);
  }

  return { dbPath };
}

function agentStorePath(): string {
  const explicit = process.env["TRACEVAULT_OPENCODE_DB"];
  if (explicit !== undefined && explicit !== "") {
    return explicit;
  }

  const home = process.env["USERPROFILE"] ?? homedir();
  const candidates = [join(home, OPENCODE_STORE)];
  const localAppData = process.env["LOCALAPPDATA"];
  if (localAppData !== undefined && localAppData !== "") {
    candidates.push(join(localAppData, "opencode", "opencode.db"));
  }

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0] ?? OPENCODE_STORE;
}

function importAgentHistory(store: EventStorePort): string {
  const source = new OpenCodeStoreSource(agentStorePath());
  try {
    if (!source.isAvailable()) {
      return "no agent store found";
    }
    const summary = new HistoryImport(
      source,
      store,
      new EventFactory("session_store"),
      new ImportedPartMapper(new ToolClassifier(new PayloadDigest()), new DenialSignal()),
    ).run();
    if (summary === null) {
      return "no agent store found";
    }
    return `history import: ${summary.events} events from ${summary.sessions} sessions (${summary.skipped} already present)`;
  } finally {
    source.close();
  }
}

function parseDirOption(args: readonly string[]): string {
  let directory = process.cwd();
  const pending = [...args];

  while (pending.length > 0) {
    const flag = pending.shift();
    if (flag === undefined) {
      break;
    }

    if (flag === "--dir") {
      const value = pending.shift();
      if (value === undefined || value === "") {
        throw new TypeError("--dir expects a directory path");
      }
      directory = value;
      continue;
    }

    throw new TypeError(`unknown option '${flag}'`);
  }

  return directory;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

async function runService(options: RunOptions): Promise<number> {
  mkdirSync(dirname(options.dbPath), { recursive: true });
  const store = new SqliteEventStore(options.dbPath);
  const factory = new EventFactory();
  const capture = new PluginHookCapture(
    new HookPayloadParser(),
    new ToolClassifier(new PayloadDigest()),
    factory,
  );
  const service = new InvestigationService(capture, store, factory, new TimelineBuilder());
  const timelineView = new TimelineView();
  const server = new DashboardServer(
    service,
    new SessionListView(),
    timelineView,
    new ActivityView(),
    undefined,
    new SessionPageView(
      new SessionHeaderView(),
      [new FileRailView(), timelineView, new WaterfallView(), new GraphView(), new SubagentPortalView()],
      new DetailPaneView(),
    ),
  );

  let importLine: string;
  try {
    importLine = importAgentHistory(store);
  } catch (error) {
    importLine = `history import skipped: ${errorMessage(error)}`;
  }

  try {
    const port = await server.listen(options.port);
    process.stdout.write(
      `${importLine}\ntracevault listening on http://127.0.0.1:${port}\nevents db: ${options.dbPath}\n`,
    );
    return 0;
  } catch (error) {
    store.close();
    if (errorCode(error) === "EADDRINUSE") {
      process.stderr.write(`tracevault: port ${options.port} is already in use\n`);
      return 1;
    }
    process.stderr.write(`tracevault: failed to start: ${errorMessage(error)}\n`);
    return 1;
  }
}

export async function main(argv: readonly string[]): Promise<number> {
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
      const options = parseImportOptions(argv.slice(1));
      mkdirSync(dirname(options.dbPath), { recursive: true });
      const store = new SqliteEventStore(options.dbPath);
      try {
        process.stdout.write(`${importAgentHistory(store)}\n`);
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
      return await runService(parseRunOptions(argv.slice(1)));
    } catch (error) {
      process.stderr.write(`tracevault: ${errorMessage(error)}\n\n${USAGE}`);
      return 1;
    }
  }

  if (first === "init" || first === "uninstall") {
    try {
      const projectDir = parseDirOption(argv.slice(1));
      const summary =
        first === "init"
          ? new InitCommand(projectDir).install()
          : new UninstallCommand(projectDir).uninstall();
      process.stdout.write(`${summary}\n`);
      return 0;
    } catch (error) {
      process.stderr.write(`tracevault: ${errorMessage(error)}\n\n${USAGE}`);
      return 1;
    }
  }

  // report belongs to a later ticket. Fail loudly rather than pretend.
  process.stderr.write(
    `tracevault: '${first}' is not implemented yet — the event schema must be approved first (docs/EVENT-SCHEMA.md)\n`,
  );
  return 2;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
