# TraceVault

Local investigation platform for AI coding agents.

Existing tools protect a boundary: Pipelock mediates network egress, mcp-firewall guards MCP calls, Rebuff screens text, halo-record seals an audit trail. None of them answers the question that follows every incident — **what did the agent actually do on this machine?**

TraceVault captures the whole workflow, flags risky configuration and risky sequences, lets a person investigate one session, and produces a report.

> IERG4999-8 Final Year Project (PKM2), CUHK — Siu Wai Ka 1155212271 · Hui Siu Hin 1155212273
> Supervisor: Dr MA Pui Kit, Jack

## Status

Semester 1 — implementation starting. The submitted proposal (30 Sep 2026) is the binding spec.
Design documents live in the Obsidian vault at `D:\hermes\obsidian-vault\CUHK\IE FYP\` — `TraceVault-v5-Plan.md` mirrors the proposal, `Proposal-SUBMITTED-TraceVault.md` is the submitted text.

## Five stages

```
Logger → Vulnerability Scanner → Workflow Scanner → Investigator → Report Generator
                                                              (+ Simulator, Semester 2)
```

Semester 1 scope is stages 1–4. The simulator is out of scope until Semester 2.

## Logger — three capture paths

| Path | Covers | Why it exists |
|---|---|---|
| Plugin hooks | Built-in editing, shell, network tools | Sits inside the agent's dispatch path, so it sees capabilities, not just tool servers |
| Session stores | Pre-install history, events hooks missed | Agents persist sessions locally; the store backfills |
| MCP proxy | Every call to an external MCP server | OpenCode's plugin hooks do not fire for MCP tool calls |

Target agent: **OpenCode first** (fully open source, interfaces readable rather than inferred). The design is written against the general mechanism; other agents are additive.

## Non-goals

- No machine learning. Scanner rules are YAML files: every flag explains itself, no training data, reproducible evaluation.
- No prevention. TraceVault observes and reports; it does not block.
- No server operated by the project. Everything is local, bound to loopback.
- No secrets brokering. Existing tools do it better; TraceVault just never logs a key's value.

## Repository layout

```
src/
  cli/            command entry points (init, run, report)
  capture/        plugin-hook receiver, session-store readers, MCP proxy
  schema/         the event schema — every stage consumes it
  scanner/        vulnerability scanner (static) + workflow scanner (rules)
  store/          SQLite, append-only, hash-chained
  investigator/   timeline merge + query
  report/         report generation
  dashboard/      local HTTP API + WebSocket + UI
rules/            YAML rule files (vulnerability + workflow)
tests/            unit tests, per-rule fixtures, end-to-end script
docs/             architecture, event schema, ADRs
```

## Getting started

```bash
npm install
npm run build
npm test
```

Node 20+ required (developed on v24).

## Documentation

- `AGENTS.md` — the working agreement every AI agent in this repo must follow (OOD + regression-lock tests)
- `docs/PHASES.md` — the five-phase ladder with exit criteria per phase
- `docs/FILE-STRUCTURE.md` — one class per file, port interfaces, where each thing lives
- `docs/ARCHITECTURE.md` — component boundaries and data flow
- `docs/EVENT-SCHEMA.md` — the shape every capture path emits
- `docs/adr/` — decision records

## Commit gate

`.githooks/pre-commit` runs typecheck + tests. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```
