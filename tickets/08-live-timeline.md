# 08 — Live timeline

**What to build:** Watching the agent work, live. With a session open, new events appear without a manual refresh, in the right position, as the agent produces them. The page stays usable while it updates — no jumping to the top, no duplicated rows.

**Blocked by:** 04 — The session timeline page.

**Status:** ready-for-agent

- [x] New events appear on an open timeline within a couple of seconds of occurring
- [ ] A live event lands in the correct position, including when it arrives out of order
- [x] No event is rendered twice during a live update
- [ ] The page remains usable — no scroll jump, no full-page reload
- [x] Seam-A test drives the update path without a live agent
