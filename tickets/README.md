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

**Phase 4 is complete.** Every ticket from 45 to 52 is done. Phase 5 (a second agent) starts only when Kevin says so; the simulator is Phase 6. Format: `docs/adr/0005-report-format.md`.

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

## Hardening before Phase 5 (requested by Kevin, 13 Nov 2026)

Text rules can be evaded, and TraceVault does not prevent. These two make evasion visible and let OpenCode's own permissions do the blocking.

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 53 | Commands whose effect cannot be read from them | 44 | done |
| 54 | Harden: let OpenCode's own permissions do the blocking | 43 | done |

## Scale and architecture before Phase 5 (requested by Kevin, 13 Nov 2026)

Spec: `docs/spec/scale-before-phase-5.md`. Local single-user is a design decision; numbers decide the optimisations.

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 55 | Old databases keep working after an upgrade | — | done |
| 56 | How slow and how big: measure first | 55 | done |
| 57 | A session under the rules then and now | 55, 56 | done |
| 58 | Store repeated configurations and tool lists once | 55, 56 | not needed (56) |
| 59 | Archive old sessions automatically | 55, 56 | done (Kevin's go, 16 Nov 2026, without waiting on real numbers) |

## Rule evasion before Phase 5 (requested by Kevin, 13 Nov 2026)

Spec: `docs/spec/evasion-before-phase-5.md`. Kevin runs the probes and the live checks.

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 60 | Computed programs and wrappers that take a value | 53 | done |
| 61 | Files written by the shell | 53, 60 | done |
| 62 | Compare the full path of the file that ran | 61 | done (probe run 15 Nov) |
| 63 | Validate the evasion rules live, and audit them for false positives | 60, 61, 62 | done (live run and audit 15 Nov) |
| 64 | Egress by program, and can the shell be routed through a proxy? | 60 | done (probe run 15 Nov) |
| 65 | Probe: can a proxy tell which call made a connection? (the proxy itself is 86 to 89) | 64 | done (probes run 16 and 17 Nov) |
| 66 | Trust an MCP tool when first seen, flag a later change | 41, 55 | done |

## Semester 1 polish (requested by Kevin, 15 Nov 2026)

Phases 1 to 4 are made solid before Phase 5. Found by a live run of the service.

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 67 | Only this machine's own pages and tools reach the service | — | done |
| 68 | `init` hardens the project unless told not to | 54 | done |

### From the 15 Nov 2026 audit

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 69 | A long session watched live does not slow the agent or invent gaps | — | done |
| 70 | The database lives outside the project by default | — | done |
| 71 | A service on another port still receives events | — | done |
| 72 | Two writers cannot break the hash chain | — | done |
| 73 | `tracevault verify` checks the record | 72 | done |
| 74 | The service says why a request failed | — | done |
| 75 | A freeze late in a long prompt is still seen | — | done |
| 76 | An MCP server whose name has an underscore is named correctly | — (probe: Kevin) | done |

### From the 15 Nov 2026 architecture review

Refactors: none changes what a user sees. Candidate 6 of the review (where the second agent plugs in) is not a ticket; it is a constraint on Phase 5, written in `docs/ROADMAP.md`.

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 77 | Seam tests run the assembly the user runs | — | done |
| 78 | One call returns everything about a session | 77 | done |
| 79 | A CLI command is one file | — | done |
| 80 | A reversible file change is written once | — (same files as 79; one at a time) | done |
| 81 | Text reaches a page through one escaping rule | — | done |

### Long sessions (requested by Kevin, 16 Nov 2026)

From the "long sessions" candidate in `HANDOVER.md`. Kevin wants 59 first; 59 waits on a real database's numbers, so these do not wait on it.

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 82 | A long session's rules are checked in time that grows with its length | 69 | done |
| 83 | A long session's page opens in pages | — | done |

### Candidates opened 16 Nov 2026 (after 83)

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 84 | A chained command is judged part by part, as OpenCode judges it | — | done |
| 85 | A changed MCP tool can be accepted | — | done |

84 and 85 are on the frontier once 82 and 83 are done.

### The shell proxy (spec `docs/spec/shell-proxy.md`, approved 16 Nov 2026)

The proxy records where the agent's shell connects, and never blocks.

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 65 | Probe: can a proxy tell which call made a connection? | 64 | done (probes run 16 and 17 Nov) |
| 86 | The proxy records a connection (tracer bullet) | 65 | done (reworked to the revised spec, 17 Nov) |
| 87 | The plugin opens a proxy for each bash call | 86 | done (live run 17 Nov) |
| 88 | Exfiltration through any program, and the hosts in the report | 86 | done |
| 89 | The first connection to an unknown host is flagged | 88 | done (audit 17 Nov; rerun after real use) |

Frontier: none open on the proxy. 89's noise is judged again after a few days of real use.

## Thermo review follow-ups (approved for the backlog)

Four independently verifiable follow-ups from the focused thermo review. Kevin approved this breakdown for later work. All remain pending; recording them does not start implementation or Phase 5.

| # | Ticket | Blocked by | Priority | Status |
|---|---|---|---|---|
| 90 | [Hardening never allows an operation the user denied](90-harden-preserves-effective-denials.md) | — | P1 | done |
| 91 | [Recording and archiving continue after the main database becomes empty](91-repeated-archives-preserve-the-chain.md) | — | P2 | done |
| 92 | [An archived report preserves its MCP tool comparison context](92-archive-reports-keep-mcp-baselines.md) | — | P2 | pending |
| 93 | [A secret read and connection within one bash call do not lose their warning](93-same-call-secret-read-and-egress.md) | — | P2 | done |

Ticket 92 improves the archive-baseline limitation already documented in the scale specification. Tickets 91 and 92 share archive code, so implement them one at a time; neither logically blocks the other. Every ticket includes its reproduction, end-to-end demo and required seam regressions.

Backlog: 92, set aside by Kevin (17 Nov 2026); 90, 91 and 93 are done. No proxy ticket is open. Choose a pending follow-up only when Kevin asks to start it.

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
