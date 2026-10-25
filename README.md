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
AGENTS.md         working agreement for AI agents (OOD, seam tests, tickets)
README.md
docs/
  spec/phase-1.md   the Phase 1 spec — binding
  ARCHITECTURE.md   stage contracts, structure rules, expected layout
  EVENT-SCHEMA.md   the event contract
  ROADMAP.md        phases 2-5
  adr/              decision records
tickets/            10 tracer-bullet tickets + index
src/                code — folders appear when a ticket needs them
  cli/              composition root (currently the only file)
tests/              seam tests + frozen fixtures
.githooks/          pre-commit gate (typecheck + tests)
```

Full Phase 1 layout, file by file, is in `docs/ARCHITECTURE.md`.

## Getting started

```bash
npm install
npm run build
npm test
```

Node 24+ required (`node:sqlite`; developed on v24).

## Documentation

- `AGENTS.md` — the working agreement every AI agent in this repo must follow (OOD + two-seam regression tests + ticket discipline)
- `docs/spec/phase-1.md` — the Phase 1 spec (also published as issue #1)
- `tickets/` — ten tracer-bullet tickets, index in `tickets/README.md`
- `docs/ROADMAP.md` — phases 2-5 with exit criteria
- `docs/ARCHITECTURE.md` — component boundaries, structure rules, expected layout
- `docs/EVENT-SCHEMA.md` — the shape every capture path emits
- `docs/adr/` — decision records

## Commit gate

`.githooks/pre-commit` runs typecheck + tests. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```
