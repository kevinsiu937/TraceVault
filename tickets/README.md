# donen — CI needs a pushnenenene)

One file per ticket, numbered in dependency order. Work the **frontier**: any ticket whose blockers are all done.

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
| 15 | Gate on shared pushes (CI) | — | open — CI needs a push |
| 16 | The investigation cockpit: three-pane session view | 04, 12 | done |
| 17 | Waterfall view: bars on a real time axis | 16 | done |
| 18 | Real per-tool duration (data, not idle) | 02 | open — waterfall pending (17) |
| 19 | File-centric lens: which files did the agent touch | 16 | done |
| 20 | Expression filters: field:value over the timeline | 13, 16 | draft — not applied |
| 21 | Prompt-turn probe: reproduce, freeze, then group | 03 | done |
| 22 | Turn-grouped collapsible list | 16, 21 | draft — not applied |
| 23 | Session list enrichment: scan, don't click | 13, 16 | draft — not applied |
| 24 | Replay bar: watch the session happen | 16, 22 | draft — not applied |
| 25 | Graph view: the run as structure | 16 | done |
| 26 | Subagents nest under their parent session | 16, 19 | done — live parentID unproven |

**Frontier now:** 15.

**Drafts 14–25** are written but not applied to the real repo — copy the files in if Kevin approves. 14 closes the open boxes on 02/07/08; 16–25 are the investigation-cockpit UI set (prototype-validated in the sketches).

## Dependency shape

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

**11 → 12 → 13 is the "see everything" chain:** import all of OpenCode's history, render it visually, then let the reader filter it. 11 can start as soon as 02 and 03 land; 12 is the page; 13 is what makes it usable at volume.

### UI set (drafts 14–25)

```
02 ─► 18
03 ─► 21 ─► 22 ─► 24
13 ─┬► 16 ─┬─► 17
    │      ├─► 19
    │      ├─► 20
    │      ├─► 23
    │      ├─► 25
    │      └─► 22 ─► 24
02 ─► 14 (closes 02/07/08 open boxes)   15 ─ (CI, independent)
```

16 is the UI tracer bullet: it establishes the three-pane cockpit every other UI ticket hangs off. 21 is a probe — the turn grouping in 22 waits on what it reports.

## Rules for whoever picks these up

- **OOD and TDD are the definition of done** — see `AGENTS.md` §0 and §8. A ticket whose code runs but whose design crosses a boundary, or which adds no test, is not done.
- Take **one ticket at a time**. Do not start a ticket whose blockers are open.
- Each ticket is a vertical slice: it ends with something demoable, not with a layer finished.
- Tests are the two seams described in the Phase 1 spec, not one per class. A ticket that adds observable behaviour adds or extends a seam test.
- Tick the acceptance boxes as they are met, in the ticket file, in the same commit as the work.
- Do not commit unless Kevin says so.
- When a ticket is done, say so in one line: what works now, what the demo shows, what the next frontier ticket is.
