# 12 — A timeline you can read at a glance

**What to build:** The session page stops being a table and becomes a visual timeline. A vertical rail with one marker per event, colour-coded by event kind, a time on the left, and a row that reads as a sentence: what was touched, with what outcome. Commands in monospace, paths shortened to the last two segments, a pill for the event kind, a badge for the outcome so failures and denials stand out from successes.

Rows expand in place to show the detail TraceVault holds for that event, so the page answers "what exactly did it run" without a second screen. A legend lists the kinds present in this session with counts.

No build step, no external assets, no client framework: server-rendered HTML with inline styles, plus the smallest possible inline script for expand and live updates.

**Blocked by:** 04 — The session timeline page. 11 — Every session OpenCode ever ran.

**Status:** done

- [x] A session page renders as a vertical timeline with a marker per event, coloured by kind
- [x] Each row shows time, kind, target and outcome, legible without clicking
- [x] Error and denied outcomes are visually distinct from success
- [x] Rows expand in place to show the stored detail for that event
- [x] A legend shows each kind present, with its count
- [x] Layout holds at a thousand events and at a narrow window
- [x] Seam test asserts the rendered order and the presence of the kind markers
