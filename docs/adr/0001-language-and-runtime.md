# ADR 0001 — TypeScript on Node, single language

- **Status:** proposed (awaiting Kevin's sign-off)
- **Date:** 25 October 2026
- **Deciders:** Kevin Siu, Hui Siu Hin

## Context

The submitted proposal leaves the stack open ("like npx init, pip init, etc"). Three facts constrain it:

1. The primary capture path is the agent's **plugin hook interface**, which the reference agent (OpenCode) exposes to **TypeScript/JavaScript plugins**. There is no Python path for it.
2. The second path is the **MCP proxy**, and an official MCP SDK exists for TypeScript (`@modelcontextprotocol/sdk`) as well as Python.
3. The install story promised in the proposal is a single command. `npx tracevault init` requires the published package to be Node; a Python core would mean either two runtimes on the user's machine or a `pipx` command plus a Node plugin, i.e. two install paths to support and two to debug.

## Decision

**TypeScript, ESM, Node 20+, single package.** Everything — CLI, capture adapters, scanners, store, investigator, report, dashboard — lives in one runtime.

## Consequences

- One install path (`npx`), one dependency tree, one test runner.
- The MCP proxy can use the official SDK rather than a hand-rolled stdio implementation.
- SQLite via `node:sqlite` (Node 22+) or `better-sqlite3`; decide in ADR 0002 when the store is built.
- A Python-only dependency later (e.g. a dataset loader for R-Judge) stays a dev-time script under `scripts/`, never a runtime requirement.
- Downside accepted: a non-Node user whose agent is not Node-based (e.g. a Python agent framework) needs a packaged binary. Out of scope for Semester 1, and the adapter boundary keeps it possible.

## Alternatives rejected

- **Python core + TS plugin** — two runtimes, two installs, plugin/core version skew. Rejected on install friction, which is the stated target user's dominant constraint.
- **Rust/Go single binary** — best distribution story, worst development speed for a two-person one-semester FYP, and the plugin still has to be TS.
