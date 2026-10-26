# 23 — Session list enrichment: scan, don't click

**What to build:** The session list becomes scannable without opening sessions: each row gains an event-density sparkline, files-touched count, error and denied counts, duration, and an outcome badge (clean / has errors / denied-heavy / open). A derived callout warns when N sessions in a row ended with errors. Filters (time range, outcome) work over the list.

**Blocked by:** 13 — Filters: show me only what I care about. 16 — The investigation cockpit: three-pane session view.

**Status:** ready-for-agent

- [x] Each session row shows: sparkline of event density, events, files, errors, denied, duration, outcome badge
- [x] Outcome badges are not colour-only (word present): clean / has errors / denied-heavy / open
- [x] A streak callout appears when ≥2 consecutive sessions ended with errors, naming them
- [x] Seam-A test: the list page renders the enrichment columns from the real store, and the streak callout appears exactly when the data justifies it

List filters (time range, outcome) remain with ticket 20's filter core.

**Technical notes (from prototype):** Prototype `002-cockpit` / `003-real-session` list page. Sparklines are inline SVG (no external asset). The streak callout came from agent-flight-recorder research ("⚠ N abandoned/blocked sessions in a row") — cheap, high-value.
