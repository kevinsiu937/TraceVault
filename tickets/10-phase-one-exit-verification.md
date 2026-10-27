# 10 — Phase 1 exit verification

**What to build:** The proof that Phase 1 is done. A documented demo, run from a clean state, that anyone can repeat: start the service, run a real agent session that shells out, edits a file and fetches a URL, then show the session and its timeline on localhost — complete, ordered, no gaps unexplained, nothing missing.

This ticket also closes the loose ends: the exit criteria in the phase plan are checked one by one and the result recorded, the README instructions are followed literally from a clean clone, and any criteria that cannot be met are reported as such rather than quietly dropped.

**Blocked by:** 05 — Ordering, sequence numbers and duplicate observations. 06 — Append-only integrity. 07 — Honest gaps. 08 — Live timeline. 09 — Reversible install.

**Status:** ready-for-agent

- [x] A scripted demo exists that any person can follow from a clean state in under five minutes (docs/DEMO.md)
- [x] Running that demo produces a session whose every action appears in the timeline, in order
- [x] Two concurrent sessions stay separate in the list and in the timeline
  - Proven with two interleaved HTTP writers (created, a1, b1, a2, b2): both rows present, each session page contained only its own actions, and each kept its order. Not proven with two real agent processes — a second concurrent `opencode` does not start under the nested runner.
- [x] Install/uninstall reversibility is demonstrated during the demo
- [x] Both seam suites are green and the phase-plan exit criteria are checked off in writing (docs/DEMO.md)
- [x] Anything unmet is reported explicitly, with why (docs/DEMO.md)
