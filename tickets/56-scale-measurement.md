# 56 — How slow and how big: measure first

**What to build:** `docs/probes/scripts/measure-scale.mjs` builds sessions of 1,000, 10,000 and 50,000 events (the Phase 2 exit run's mix, with a configuration snapshot and a tool list per session) and records the median time of the service calls, the session page and the report, and the database's size, in `docs/probes/scale-measurements.md`. The numbers decide the 57 cache, 58 and 59.

**Blocked by:** 55

**Status:** done

- [x] The script runs against `dist/` into a scratch database and never touches `data/`
- [x] Each number says what limits it and what it measures
- [x] The document states whether the numbers call for a findings cache, for 58 and for 59

**Result (13 Nov 2026):**
- Three session-window rules (`destructive-action`, `exfiltration-chain`, `runs-written-file`) grow with the square of the session.
- The session page took 5.3 s at 10,000 events. With the findings cache it takes 3.0 s on a first view and 0.56 s on a repeat view.
- Configurations and tool lists are 2.2 KB per session, so 58 is not needed.
- 59 is not called for by these numbers alone.

Details: `docs/probes/scale-measurements.md`.
