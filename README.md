# TraceVault

Local investigation platform for AI coding agents.

Existing tools protect a boundary: Pipelock mediates network egress, mcp-firewall guards MCP calls, Rebuff screens text, halo-record seals an audit trail. None of them answers the question that follows every incident: **what did the agent actually do on this machine?**

TraceVault records what an OpenCode agent did, flags risky configuration and risky sequences of actions, lets a person investigate one session, and exports a plain-language report.

> IERG4999-8 Final Year Project (PKM2), CUHK — Siu Wai Ka 1155212271 · Hui Siu Hin 1155212273
> Supervisor: Dr MA Pui Kit, Jack

## Status

Phases 1 to 4 are closed (capture, workflow findings, configuration findings, reports), with the hardening, scale and shell-proxy follow-ups done. Phase 5 (a second agent) has not started. The target agent is **OpenCode**.

Not yet packaged: TraceVault runs from a clone, and its service is started by hand. See [Known limits](#known-limits).

## What it does

| Stage | What you get |
|---|---|
| Record | Every tool call, prompt, permission answer and subagent of an OpenCode session, in a local SQLite database whose rows are hash-chained. Earlier history is imported from OpenCode's own store. |
| Watch the shell's network | Before each bash call, the plugin points the call at a proxy of its own on 127.0.0.1. Each connection is recorded as host and port under the call that made it. Traffic passes through unchanged and is never read. |
| Workflow findings | YAML rules in `rules/` flag risky sequences: a secret read then sent out, a destructive command after "don't delete", opaque commands, a file written then run, a first connection to an unknown host. |
| Configuration findings | Rules in `rules/config/` flag a risky `opencode.json` and poisoned or changed MCP tools. |
| Investigate | A local dashboard: session list, timeline, waterfall, file view, graph, replay, filters, findings linked to their events. |
| Report | One self-contained HTML file per session, in plain language, with a recommendation for each finding. |

TraceVault observes and reports. Two opt-in exceptions: `init --block` skips a call a blockable rule matches, and `harden` (run by `init` by default) makes the project's `opencode.json` ask before risky calls, so OpenCode itself does the stopping.

## Getting started

Requires Node 24 or later (`node:sqlite`) and OpenCode.

```bash
git clone <this repo> && cd TraceVault
npm install
npm run build
```

Attach TraceVault to a project, then start the service:

```bash
node dist/cli/index.js init --dir <your project>   # installs the plugin; hardens opencode.json (undo: uninstall)
node dist/cli/index.js run                         # service and dashboard on http://127.0.0.1:4319
```

Use OpenCode in that project as usual, with the service running. Open http://127.0.0.1:4319 to see the sessions.

## Commands

| Command | What it does |
|---|---|
| `init [--dir <path>] [--block] [--no-harden] [--port <n>]` | Install the plugin in a project. Hardens `opencode.json` unless `--no-harden`. `--port` when the service is not on 4319. |
| `run [--port <n>] [--db <path>] [--archive-after <days>]` | Start the service. Imports OpenCode's history first, and moves sessions that ended more than 90 days ago to a monthly archive file (0 turns this off). |
| `report <session-id> --out <file> [--db <path>] [--rules now\|then]` | Write one session as an HTML report, under today's rules or those in force when it was recorded. |
| `verify [--db <path>]` | Check that no stored event was changed or removed. Exits 1 on a break. |
| `trust <server> [--db <path>]` | Accept an MCP server's current tools after a deliberate upgrade. |
| `harden [--dir <path>] [--undo]` | Make `opencode.json` ask before risky calls, or put the original back. |
| `import [--db <path>]` | Import OpenCode's existing session history. |
| `uninstall [--dir <path>]` | Remove the plugin and restore the configuration, including what `init` or `harden` changed. |

Run them as `node dist/cli/index.js <command>`. Without `--db`, the database is `tracevault/tracevault.db` in your state folder (`~/.local/state`, or `%LOCALAPPDATA%` on Windows), never the current folder.

A step-by-step walk-through of every feature, with the last recorded run, is in `docs/DEMO.md`.

## Known limits

- **Start the service to see sessions.** While it is down, the plugin keeps what it cannot send in an owner-only outbox (up to 10 MB) and sends it, at the times it happened, on the next event after the service is back. Past 10 MB the oldest are dropped and the session shows a gap.
- **Not packaged.** No npm release yet; the plugin `init` writes points at this clone's `dist/`, so moving the clone breaks it (run `init` again).
- **OpenCode only.** A second agent is Phase 5.
- **Rules read commands as written.** Aliases, functions and variables are not expanded, and a program that ignores proxy variables (`nc`, `ssh`, raw sockets) is not seen by the proxy.
- Each spec lists its own blind spots under "Known Blind Spots": `docs/spec/`.

## Non-goals

- No machine learning. Rules are YAML files: every flag explains itself, with no training data and a reproducible evaluation.
- No server operated by the project. Everything is local, bound to loopback; the dashboard refuses requests from other web sites.
- No reading of encrypted traffic, and no secrets brokering. TraceVault never logs a key's value from configuration.

## Repository layout

```
AGENTS.md         working agreement for AI agents (OOD, seam tests, tickets)
HANDOVER.md       current state and open decisions
docs/
  spec/           one spec per phase and follow-up, each with its known blind spots
  adr/            decision records
  probes/         live probes of OpenCode and their recorded results
  DEMO.md         every feature, step by step
  ROADMAP.md      phases 2 to 6
rules/            workflow rules; rules/config/ configuration rules; rules/lists/ shared lists
src/
  capture/        hook payloads and the shell proxy to events
  store/          SQLite event store, hash chain, archive
  service/        sessions, timelines, findings
  scanner/        rule engine (dynamic) and configuration scanner (static)
  dashboard/      HTML views and the HTTP server
  plugin/         the OpenCode plugin
  cli/            commands and the composition root
tests/            seam tests and frozen fixtures
tickets/          one file per ticket; index in tickets/README.md
.githooks/        pre-commit gate (typecheck and tests)
```

## Development

```bash
npm run typecheck && npm run build && npx vitest run
git config core.hooksPath .githooks   # once per clone: the pre-commit gate
```

Read `AGENTS.md` before changing code.
