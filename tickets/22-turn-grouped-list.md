# 22 — Turn-grouped collapsible list

**What to build:** The List view groups events into turns: a turn divider (prompt, step count, duration, error summary) above the actions it caused; rows are one-line headers (status dot, kind, target, outcome pill, duration) that expand to the stored event JSON; consecutive repeated calls collapse into "N × command" rows. Turn dividers come from 21's prompt events; until they exist, the list renders one honest "Full run" group.

**Blocked by:** 16 — The investigation cockpit: three-pane session view. 21 — Prompt-turn probe: reproduce, freeze, then group.

**Status:** done

- [x] A turn divider shows prompt text, action count, duration, and an error/denied summary
- [x] Event rows collapse/expand to the stored event JSON; a row header never wraps past one line
- [x] Consecutive identical calls group into an expandable "N × command" row
- [x] A turn containing any error shows an error border on its divider (prototype: inset 3px red)
- [x] Seam-A test: two turns render with correct dividers and per-turn counts

**DECISION (measured from the live probe):** the agent injects its own prompt events (the `<available-skills>` block). A prompt is harness-injected when its text starts with `<` and closes a tag (`</`) within its first 200 characters. Those prompts start no turn and are not rendered: otherwise the run sprouts a fake turn and the harness prompt leaks into the page. With a filter active the list shows one `Filtered events` group instead of attributing filtered rows to turns; with no real prompts it shows one `Full run` group.


**Technical notes (from prototype):** Prototype `003-real-session` renders this layout; the demo turn data was synthetic because real data lacks prompts — the grouping logic ships behind 21's outcome. Error border + one-line rows are from the mockup's CSS and are the parts worth keeping verbatim.

**DECISION (repeated calls):** "identical" means same kind, same target and same operation, consecutive inside one turn; boundaries, gaps, duplicates and prompts never group. A run is a native `<details>` whose summary is the one-line `N × target` header (first call's time, summed duration, one pill per outcome with counts, worst first, and the error/denied ring on the marker) and whose body holds every call as its ordinary row. Nothing leaves the page — rows only move under their run — so the 1000-row and duplicate-row guarantees hold unchanged, which is what un-deferred this box. The run holding the selected event renders open. A live row that lands before a run's first call goes before the run; a live row that lands between two calls of a run unfolds the run into plain rows, because those calls are no longer consecutive. A live call identical to the run before it stays a plain row until reload. Live check in headless Chrome: three `npm test` calls (one failed) collapsed to `3 × npm test` with `1 error` and `2 ok` pills, expanded to three rows, and a streamed call still landed at the bottom. The live insert is browser script that Seam A cannot reach; headless Chrome confirmed a row between two calls (`00 | 01 | 01.5 | 02`, run unfolded), before a run, and after a run each land in timestamp order. That check is outside the gate.
