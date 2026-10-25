#!/usr/bin/env node
/**
 * TraceVault CLI entry point.
 *
 * Semester 1 commands:
 *   init     attach TraceVault to the local agent (MCP proxy entry + plugin hooks)
 *   run      start the local service (capture + scanners + dashboard on 127.0.0.1)
 *   report   produce a report from stored events
 *
 * Only argument parsing and exit codes belong here. Behaviour lives in the
 * component modules so it can be tested without spawning a process.
 */

export const VERSION = "0.1.0";

const USAGE = `tracevault ${VERSION}

Usage:
  tracevault init [--agent opencode]   attach TraceVault to an agent
  tracevault run [--port <n>]          start the local service
  tracevault report [--session <id>]   generate a report
  tracevault --version
  tracevault --help
`;

type Command = "init" | "run" | "report";

const COMMANDS: readonly Command[] = ["init", "run", "report"];

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

export function main(argv: readonly string[]): number {
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

  // Stage 1 (Logger) is not implemented yet. Fail loudly rather than pretend.
  process.stderr.write(
    `tracevault: '${first}' is not implemented yet — the event schema must be approved first (docs/EVENT-SCHEMA.md)\n`,
  );
  return 2;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  process.exit(main(process.argv.slice(2)));
}
