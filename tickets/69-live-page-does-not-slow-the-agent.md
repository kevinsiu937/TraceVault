# 69 — A long session watched live does not slow the agent or invent gaps

**What to build:** While a session page is open, every new event made the service scan the whole session again before it answered the plugin. Measured on 15 Nov 2026 on a synthetic worst-case session: one event took 1.4 to 1.7 s at 4,000 events and 6 to 8 s at 10,000. The plugin waits 2 s, then records a "capture endpoint unavailable" gap for an event that was in fact stored. A new event must cost the same whether the session holds a hundred events or ten thousand, and the findings must stay exactly what a full scan gives.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] Findings for a session that grows one event at a time equal a full scan's, for every rule fixture (Seam C)
- [x] An event that sorts before ones already seen (a late prompt, a gap) still gives a full scan's findings (Seam C)
- [x] Breaking the continuation (state not reset, an event fed twice) fails those tests
- [x] Measured again with the same script: an event into a 10,000-event session with the page open returns well inside the plugin's 2 s wait; the numbers go in `docs/probes/scale-measurements.md`
- [x] Typecheck, build and the full suite pass

**Technical notes:**
- The red test here is a measurement, not a unit test: the gate allows no wall-clock timing. `docs/probes/scripts/measure-live.mjs` recorded 6 to 8 s before and 63 to 73 ms after at 10,000 events; both are in `docs/probes/scale-measurements.md`. The Seam C tests lock that the continued scan finds what a full scan finds.
- `WorkflowScannerPort` gains `begin()`, a scan fed one event at a time (`WorkflowScan`, `RuleSetScan`); `scan` is built on it. `SessionFindings` continues a session's scan when the session only grew at its end, and starts again otherwise.
- Not changed: the first view of a long session after a restart still scans it whole.
