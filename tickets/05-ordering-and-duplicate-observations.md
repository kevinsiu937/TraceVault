# 05 — Ordering, sequence numbers and duplicate observations

**What to build:** Ordering becomes defensible. Events sort by timestamp, then by the agent's own sequence number where it provides one, then by capture path. Two observations of the same action — the same call seen by more than one path — are recorded as a duplicate observation and collapsed once at read time, so the timeline neither double-reports nor silently loses evidence.

A fixture set is frozen here: payloads captured from a real session, stored as files, and used by every later seam-B test.

**Blocked by:** 04 — The session timeline page.

**Status:** ready-for-agent

- [ ] Two events with identical timestamps order deterministically and the order is asserted in a test
- [ ] A duplicated observation appears once in the timeline and is recorded as a duplicate in the store
- [ ] The collapse happens at read time; stored evidence is unchanged
- [ ] Recorded payload fixtures from a real session are committed under the fixtures directory
- [ ] Seam-B tests cover ordering and the duplicate case
