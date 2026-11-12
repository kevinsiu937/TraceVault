# Tickets

One file per ticket, numbered in dependency order. Work the **frontier**: any ticket whose blockers are all done.

## Phase 1: backbone and investigation cockpit (closed)

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 01 | Walking skeleton: one tool call, end to end | — | done |
| 02 | Every tool type, with outcomes | 01 | done |
| 03 | Session boundaries and open sessions | 01 | done |
| 04 | The session timeline page | 02, 03 | done |
| 05 | Ordering, sequence numbers and duplicate observations | 04 | done |
| 06 | Append-only integrity | 01 | done |
| 07 | Honest gaps | 03, 04 | done |
| 08 | Live timeline | 04 | done |
| 09 | One command to install, one to remove | 01 | done |
| 10 | Phase 1 exit verification | 05, 06, 07, 08, 09 | done |
| 11 | Every session OpenCode ever ran (history import) | 02, 03 | done |
| 12 | A timeline you can read at a glance | 04, 11 | done |
| 13 | Filters: show me only what I care about | 12 | done |
| 14 | Settle the three live unknowns (probe) | 02, 07, 08 | done |
| 15 | Gate on shared pushes (CI) | — | done |
| 16 | The investigation cockpit: three-pane session view | 04, 12 | done |
| 17 | Waterfall view: bars on a real time axis | 16 | done |
| 18 | Real per-tool duration (data, not idle) | 02 | done |
| 19 | File-centric lens: which files did the agent touch | 16 | done |
| 20 | Expression filters: field:value over the timeline | 13, 16 | done |
| 21 | Prompt-turn probe: reproduce, freeze, then group | 03 | done |
| 22 | Turn-grouped collapsible list | 16, 21 | done |
| 23 | Session list enrichment: scan, don't click | 13, 16 | done |
| 24 | Replay bar: watch the session happen | 16, 22 | done |
| 25 | Graph view: the run as structure | 16 | done |
| 26 | Subagents nest under their parent session | 16, 19 | done |

## Phase 2: workflow scanner

Spec: `docs/spec/phase-2.md`.

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 27 | Self-modification, flagged end to end (tracer bullet) | Phase 2 spec approved | done |
| 28 | Exfiltration chain: a sensitive read, then data leaves | 27 | done |
| 29 | Probing: repeated denied calls | 28 | done |
| 30 | Destructive action after a declared freeze | 28 | done |
| 31 | Scope drift: access outside the project | 28 | done |
| 32 | Escalation then use (probe first) | 28 | done |
| 33 | Phase 2 exit verification | 27, 28, 29, 30, 31 | done |
| 34 | Opt-in blocking: refuse before it runs | 33 | done |
| 44 | Sensitive files read through the shell, and pushes (follow-up; also adds the static rule git-push-unasked) | 34 | done |

**Phase 2 is complete.** Every ticket from 27 to 34 is done. Ticket 44 is a follow-up Kevin asked for on 12 Nov 2026.

## Phase 3: static scanner and tool poisoning

Spec: `docs/spec/phase-3.md`, approved 11 Nov 2026.

**Phase 3 is complete.** Every ticket from 35 to 43 is done. Phase 4 starts only when Kevin says so.

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 35 | The configuration a session ran under (probe first) | Phase 3 spec approved | done |
| 36 | Shell without asking, flagged end to end (tracer bullet) | 35 | done |
| 37 | Missing boundaries: the agent can edit its own configuration | 36 | done |
| 38 | Ungoverned grants: a default question answered in advance | 36 | done |
| 39 | Dangerous combination: read secrets and send data out | 36 | done |
| 40 | Unscoped credentials: MCP servers that hold credentials | 36 | done |
| 41 | The tools a local MCP server offers, through a relay | 35 | done |
| 42 | Tool poisoning: hidden instructions and invisible text | 36, 41 | done |
| 43 | Phase 3 exit verification | 36, 37, 38, 39, 40, 42 | done |

## Phase 4: report generator

Spec: `docs/spec/phase-4.md`, approved 12 Nov 2026.

**Phase 4 is complete.** Every ticket from 45 to 52 is done. Phase 5 starts only when Kevin says so. Format: `docs/adr/0005-report-format.md`.

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 45 | Every finding says what to do about it | Phase 4 spec approved | done |
| 46 | Skipped calls at the top of the session page | 45 | done |
| 47 | Report tracer bullet: one session, one HTML file | Phase 4 spec approved | done |
| 48 | Report: skipped calls and workflow findings | 45, 46, 47 | done |
| 49 | Report: configuration findings | 45, 47 | done |
| 50 | "Export report" on the session page | 47 | done |
| 51 | Phase 4 exit verification | 46, 48, 49, 50, 52 | done |
| 52 | A report anyone can read (found by the exit run) | 48, 49 | done |

## Dependency shape

### Phase 1

```
01 ─┬─► 02 ─┬─► 04 ─┬─► 05 ─┐
    │       │       ├─► 08 ─┤
    │       │       └─► 07 ◄┼── 03
    │       └─► 11 ──► 12 ──► 13
    ├─► 03 ──┘              │
    ├─► 06 ─────────────────┤
    └─► 09 ─────────────────┤
                            └─► 10
```

01 is the tracer bullet: it cuts every layer once so the rest is filling in a path that already exists.

**11 → 12 → 13 is the "see everything" chain:** import all of OpenCode's history, render it visually, then let the reader filter it.

### Investigation cockpit (14–26)

```
02 ─► 18
03 ─► 21 ─► 22 ─► 24
13 ─┬► 16 ─┬─► 17
    │      ├─► 19 ─► 26
    │      ├─► 20
    │      ├─► 23
    │      ├─► 25
    │      └─► 22 ─► 24
02 ─► 14 (closes 02/07/08 open boxes)   15 ─ (CI, independent)
```

16 is the UI tracer bullet: it establishes the three-pane cockpit every other UI ticket hangs off.

### Phase 2

```
27 ─► 28 ─┬─► 29 ─┐
          ├─► 30 ─┤
          ├─► 31 ─┼─► 33 ─► 34
          └─► 32  │
   27, 28 ────────┘
```

27 is the scanner's tracer bullet: one single-step rule through loader, scanner, service, page and Seam C. 28 proves multi-step matching. 32 is off the exit path because it depends on a probe. 34 adds blocking last, and only as an opt-in.

### Phase 3

```
35 ─┬─► 36 ─┬─► 37 ─┐
    │       ├─► 38 ─┤
    │       ├─► 39 ─┤
    │       ├─► 40 ─┼─► 43
    │       └─► 42 ─┘
    └─► 41 ───► 42
```

35 is the capture tracer bullet: the configuration reaches a session's Configuration view with secrets removed, before any rule exists. 36 is the scanner's tracer bullet: one rule through the shared rule primitives, effective permissions, loader, scanner, service, view and Seam C. 37 to 40 are one rule family each, on that path. 41 and 42 carry tool poisoning, which depends on a probe of what OpenCode shows plugins about MCP tools.

### Phase 4

```
45 ─┬─► 46 ─────────┐
    ├─────────► 48 ─┤
    └─────────► 49 ─┼─► 51
47 ─┬─────────► 48  │
    ├─────────► 49  │
    └─► 50 ─────────┘
```

45 and 47 are the two starting points: the recommendation reaches the dashboard, and an empty report reaches a file. 48 and 49 fill the report. 50 adds the link, sharing the renderer with the CLI.

## Rules for whoever picks these up

- **OOD and TDD are the definition of done.** See `AGENTS.md` §0 and §8. A ticket whose code runs but whose design crosses a boundary, or which adds no test, is not done.
- Take **one ticket at a time**. Do not start a ticket whose blockers are open.
- Each ticket is a vertical slice: it ends with something demoable, not with a layer finished.
- Tests attach at the three seams in `AGENTS.md` §3, not one per class. A ticket that adds observable behaviour adds or extends a seam test.
- Tick the acceptance boxes as they are met, in the ticket file, in the same commit as the work.
- Do not commit unless Kevin says so.
- When a ticket is done, say so in one line: what works now, what the demo shows, what the next frontier ticket is.
