# 03 — Session boundaries and open sessions

**What to build:** Sessions become first-class. A session starts, accumulates events, and ends; a session that never ends is shown as open rather than silently looking complete. The dashboard's session list carries start time, end time when known, event count and agent identity, newest first.

Resuming a paused session must not split one story into two — confirm how the agent reports resumed work and make the list reflect reality rather than file rollover.

**Blocked by:** 01 — Walking skeleton.

**Status:** ready-for-agent

- [x] A completed session shows a start and an end
- [x] A session interrupted mid-run appears as open, not as complete
- [x] A resumed session reads as one session, matching how the agent itself reports it
- [x] Session list is ordered newest first and shows start, end/open, event count and agent
- [x] Seam-B test covers start/end and the interrupted case
