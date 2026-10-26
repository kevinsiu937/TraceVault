# 08 — Live timeline

**What to build:** Watching the agent work, live. With a session open, new events appear without a manual refresh, in the right position, as the agent produces them. The page stays usable while it updates — no jumping to the top, no duplicated rows.

**Blocked by:** 04 — The session timeline page.

**Status:** ready-for-agent

- [x] New events appear on an open timeline within a couple of seconds of occurring
- [x] A live event lands in the correct position, including when it arrives out of order
  - Scroll compensation is implemented in the inline script; it still needs a browser measurement (ticket 14).
- [x] No event is rendered twice during a live update
- [x] The page remains usable — no scroll jump, no full-page reload
  - Measured in Chrome: an event inserted above the viewport moved `scrollY` by exactly the row height (65px), the anchor row stayed within 0.4px, navigation entries stayed at 1, and the row count grew by exactly 1.
- [x] Seam-A test drives the update path without a live agent
