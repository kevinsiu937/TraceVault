# Tickets — Phase 1 (Backbone)

One file per ticket, numbered in dependency order. Work the **frontier**: any ticket whose blockers are all done.

| # | Ticket | Blocked by | Start now? |
|---|---|---|---|
| 01 | Walking skeleton: one tool call, end to end | — | ✅ **frontier** |
| 02 | Every tool type, with outcomes | 01 | no |
| 03 | Session boundaries and open sessions | 01 | no |
| 04 | The session timeline page | 02, 03 | no |
| 05 | Ordering, sequence numbers and duplicate observations | 04 | no |
| 06 | Append-only integrity | 01 | no |
| 07 | Honest gaps | 03, 04 | no |
| 08 | Live timeline | 04 | no |
| 09 | One command to install, one to remove | 01 | no |
| 10 | Phase 1 exit verification | 05, 06, 07, 08, 09 | no |

## Dependency shape

```
01 ─┬─► 02 ─┐
    ├─► 03 ─┴─► 04 ─┬─► 05 ─┐
    │               ├─► 07 ◄── 03
    │               └─► 08 ─┤
    ├─► 06 ─────────────────┤
    └─► 09 ─────────────────┤
                            └─► 10
```

01 is the tracer bullet: it cuts every layer once so the rest is filling in a path that already exists.

## Rules for whoever picks these up

- **OOD and TDD are the definition of done** — see `AGENTS.md` §0 and §8. A ticket whose code runs but whose design crosses a boundary, or which adds no test, is not done.
- Take **one ticket at a time**. Do not start a ticket whose blockers are open.
- Each ticket is a vertical slice: it ends with something demoable, not with a layer finished.
- Tests are the two seams described in the Phase 1 spec, not one per class. A ticket that adds observable behaviour adds or extends a seam test.
- Tick the acceptance boxes as they are met, in the ticket file, in the same commit as the work.
- Do not commit unless Kevin says so.
- When a ticket is done, say so in one line: what works now, what the demo shows, what the next frontier ticket is.
