# 04 — The session timeline page

**What to build:** The screen that answers the actual question. Clicking a session shows its events in execution order, one row per event: type, target, outcome, time. Errors and denials are visually distinct from successes without reading the row twice.

This is the first ticket where the reader can answer "what did it do, in what order" without opening a transcript. Nothing is flagged or interpreted — the page reports, it does not judge.

**Blocked by:** 02 — Every tool type, with outcomes. 03 — Session boundaries and open sessions.

**Status:** ready-for-agent

- [ ] Clicking a session shows its events in execution order, not insertion order
- [ ] Every row shows type, target, outcome and time, legible without further clicking
- [ ] Denied and error rows are distinguishable from successes at a glance
- [ ] A session with a thousand events renders without a visible stall
- [ ] Seam-A test exists: a request for a session's page, against a temporary database, contains the expected rows in the expected order
