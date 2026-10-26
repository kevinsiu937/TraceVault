# 14 — Settle the three live unknowns (probe ticket)

**What to build:** Three acceptance boxes stay open because the live shape was never observed: 02's denied call, 07's service-down gap, 08's out-of-order arrival and scroll behaviour. This ticket reproduces each one against a real OpenCode session, freezes the recorded payloads as fixtures, and closes the boxes with tests against those fixtures — exactly the probe-first path `AGENTS.md` §3 allows: *probe it first, record what it returned, then write the test against the recorded fixture, and say in the report that this is what happened.*

**Blocked by:** 02, 07, 08 — this ticket exists to close their remaining open boxes. Start once 02's tool surface is in (it is: the surface is done, only the denied shape is unobserved).

**Status:** ready-for-agent

- [x] Denial probe: a permission-denied tool call is reproduced live; the raw hook payload is frozen as a fixture; 02's "denied, not error, not absent" box is ticked and pinned by a seam-B test
- [x] Service-down probe: the service is stopped mid-session and restarted; the recorded interval shape is frozen as a fixture; 07's "uncovered, not empty" box is ticked and pinned
  - Fixture: `tests/fixtures/capture-gap-service-down.json`. Live proof: the session ran entirely while the service was down, the gap survived plugin-process exit, the next process flushed it, and the list row showed `uncovered`.
- [x] Out-of-order probe: events arriving out of timestamp order during a live session are observed and recorded; 08's "lands in the correct position, including out of order" box is ticked and pinned
  - Not reachable as a live hook arrival: the service stamps receipt time, so live events are always monotonic. Proven at seam A by recording an event with an earlier receipt time; the SSE payload carried `position: 0` and a refresh agreed. Stated plainly rather than claimed as a live observation.
- [x] Scroll measurement: live-page scroll/position behaviour under load is measured (a physical measurement, so it may be probed before its test); 08's "no scroll jump, no full-page reload" box is ticked and pinned
  - Chrome/CDP, 1010 rows, insert above the viewport: scrollY +65px (row height), anchor moved 0.4px, 1 navigation, +1 row.
- [x] Every new fixture is scrubbed: no credential, no absolute user path, no full argument payload — verified by the same checks 02 already enforces
- [x] The report says what happened for each probe, per `AGENTS.md` §3 — the demo of this ticket is the probe narrative, not just green tests
