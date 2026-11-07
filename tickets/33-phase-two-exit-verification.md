# 33 — Phase 2 exit verification

**What to build:** Proof that Phase 2 meets its exit criteria on a real run, then that proof frozen into the gate.

**Blocked by:** 27, 28, 29, 30, 31.

**Status:** blocked (see Blocked by)

- [ ] A scripted `opencode run` session in a temp workspace edits the agent config, reads a planted `.env` and then requests a local address, makes three auto-rejected `ask` calls, and declares a freeze and then deletes a planted file
- [ ] The session page shows at least three distinct rule ids, and every flag's event ids appear as rows on that page
- [ ] A clean scripted run (a read and `ls`, no egress, no deletion) shows zero flags
- [ ] Both runs are frozen, scrubbed, as Seam C fixtures; the gate asserts at least three rule ids, that every finding's event ids resolve inside the fixture, and that the clean run is empty
- [ ] Live evidence is recorded here, the way ticket 10 recorded it
- [ ] `npm run build`, `npm run typecheck` and `npm test` all pass

**Technical notes:** The egress target is local, so nothing leaves the machine. The live run is integration and stays out of the gate; only the frozen fixtures run on every commit.
