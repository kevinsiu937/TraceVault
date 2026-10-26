# 07 — Honest gaps

**What to build:** Absence of evidence stops looking like absence of activity. When capture was not running — service down, plugin not loaded, an interval with no data — the timeline shows an explicit gap instead of an unbroken line. A reader can tell the difference between "the agent did nothing" and "we were not watching".

**Blocked by:** 03 — Session boundaries and open sessions. 04 — The session timeline page.

**Status:** ready-for-agent

- [x] An interval in which capture was unavailable appears in the timeline as an explicit gap with a reason
- [x] A session recorded while the service was down is reported as uncovered, not as empty
  - Note: the pending gap is now durable across plugin processes (file-backed state at `%LOCALAPPDATA%\tracevault\pending-gaps.json`, `~/.local/state/…` elsewhere).
- [x] Gaps are data in the store, not a rendering trick on the page
- [x] Seam-B test covers gap creation; seam-A test covers gap rendering
