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
 * Only finding the command and turning its result into an exit code belong
 * here. Each command owns its flags and usage lines in its own file.
 */

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PluginConfig } from "../plugin/PluginConfig.js";
import type { CliCommand } from "./CliCommand.js";
import { HardenCliCommand } from "./HardenCliCommand.js";
import { ImportCliCommand } from "./ImportCliCommand.js";
import { InitCliCommand } from "./InitCliCommand.js";
import { ReportCommand } from "./ReportCommand.js";
import { RunCommand } from "./RunCommand.js";
import { UninstallCliCommand } from "./UninstallCliCommand.js";
import { VerifyCommand } from "./VerifyCommand.js";

export const VERSION = "0.1.0";

/** Every command, in the order the usage text lists them. A new command is a new file and one line here. */
function commands(): readonly CliCommand[] {
  // Outside the project on purpose: a database in the working folder is one `git add .` from being published.
  const dbPath = join(PluginConfig.stateDirectory(), "tracevault.db");
  return [
    new InitCliCommand(),
    new UninstallCliCommand(),
    new HardenCliCommand(),
    new ImportCliCommand(dbPath),
    new RunCommand(dbPath),
    new ReportCommand(dbPath),
    new VerifyCommand(dbPath),
  ];
}

function usage(all: readonly CliCommand[]): string {
  return `tracevault ${VERSION}

Usage:
${all.map((command) => command.usage).join("\n")}
  tracevault --version
  tracevault --help

Without --db, the database is tracevault/tracevault.db in your state folder
(~/.local/state, or %LOCALAPPDATA% on Windows), never the current folder.
`;
}

export async function main(argv: readonly string[]): Promise<number> {
  const all = commands();
  const first = argv[0];

  if (first === "--version" || first === "-v") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (first === undefined || first === "--help" || first === "-h") {
    process.stdout.write(usage(all));
    return first === undefined ? 1 : 0;
  }

  const command = all.find((candidate) => candidate.name === first);
  if (command === undefined) {
    process.stderr.write(`tracevault: unknown command '${first}'\n\n${usage(all)}`);
    return 1;
  }

  try {
    return await command.run(argv.slice(1));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`tracevault: ${message}\n${command.usageOnError ? `\n${usage(all)}` : ""}`);
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
