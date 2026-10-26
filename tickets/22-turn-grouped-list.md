# 22 — Turn-grouped collapsible list

**What to build:** The List view groups events into turns: a turn divider (prompt, step count, duration, error summary) above the actions it caused; rows are one-line headers (status dot, kind, target, outcome pill, duration) that expand to the stored event JSON; consecutive repeated calls collapse into "N × command" rows. Turn dividers come from 21's prompt events; until they exist, the list renders one honest "Full run" group.

**Blocked by:** 16 — The investigation cockpit: three-pane session view. 21 — Prompt-turn probe: reproduce, freeze, then group.

**Status:** done

- [x] A turn divider shows prompt text, action count, duration, and an error/denied summary
- [x] Event rows collapse/expand to the stored event JSON; a row header never wraps past one line
- [ ] Consecutive identical calls group into an expandable "N × command" row — **deferred:** collapsing would change the row count the 1000-row and duplicate-row guarantees assert; revisit when those tests can tolerate grouped rows
- [x] A turn containing any error shows an error border on its divider (prototype: inset 3px red)
- [x] Seam-A test: two turns render with correct dividers and per-turn counts

**DECISION (measured from the live probe):** the agent injects its own prompt events (the `<available-skills>` block). A prompt is harness-injected when its text starts with `<` and closes a tag (`</`) within its first 200 characters. Those prompts start no turn and are not rendered: otherwise the run sprouts a fake turn and the harness prompt leaks into the page. With a filter active the list shows one `Filtered events` group instead of attributing filtered rows to turns; with no real prompts it shows one `Full run` group.


**Technical notes (from prototype):** Prototype `003-real-session` renders this layout; the demo turn data was synthetic because real data lacks prompts — the grouping logic ships behind 21's outcome. Error border + one-line rows are from the mockup's CSS and are the parts worth keeping verbatim.
