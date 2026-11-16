# 82 — A long session's rules are checked in time that grows with its length

**What to build:** The first open of a 50,000-event session takes 54 s (`docs/probes/scale-measurements.md`). `RuleMatcher` opens a partial match for every event that fits a rule's first step, and a rule with no window never lets one expire. Each new event is then checked against every open match, so the scan grows with the square of the session: five times the events cost 15 to 19 times the time. The open matches are mostly the same: they wait for the same next step with the same bindings, and an event closes only the oldest of them. Matches that cannot be told apart are kept once, so the number held open depends on how many different situations the session has, not on how long it is.

Which matches are interchangeable is the design work. A match's events become the finding's `eventIds`, so merging must keep the findings each rule raises today. If a rule cannot keep its findings when merged, it stays as it is, and the ticket says which rule and why.

From the "long sessions" candidate in `HANDOVER.md`. `destructive-action`, `exfiltration-chain` and `runs-written-file` are the rules the measurement showed to grow with the square of the session.

**Blocked by:** 69 (done; the scan already resumes where it stopped). Kevin asked for 59 to come first; 59 is waiting on a real database's numbers, so this ticket can start without it.

**Status:** ready-for-agent

- [ ] Every rule's trigger and clean fixtures raise the same findings, with the same event ids, as before (Seam C, unchanged)
- [ ] A Seam C test of a long session, with many first steps and no window, raises the same findings as the old matcher gave it
- [ ] Ten times the events cost at most about ten times the scan time, measured by `measure-scale.mjs`
- [ ] `docs/probes/scale-measurements.md` gets the new cold-scan rows, beside the old ones
- [ ] Typecheck, build and the full suite pass
