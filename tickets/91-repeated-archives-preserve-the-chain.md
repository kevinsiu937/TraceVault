# 91 — Recording and archiving continue after the main database becomes empty

**What to build:** A developer can archive all eligible sessions, record new sessions, and archive again without a primary-key error or a broken chain. Both the main database and every archive remain independently verifiable across restarts and monthly archive files.

**Blocked by:** None. Follow-up to completed tickets 59, 72 and 73. Coordinate shared archive changes with ticket 92, but neither implementation requires the other.

**Status:** done (17 Nov 2026). Root cause: an append linked to the last row left in the main database, not past the anchors of rows already archived, so the next run anchored a hash a second time. `SqliteEventStore.append` now follows those anchors. No schema change. A database that already holds rows linked the old way still fails to archive them; none is known.

**Priority:** P2.

**Evidence:** Archive all of session A, leaving no events in the main database. Record session B and archive it on another run. The second archive raises a uniqueness error on an anchor's starting hash because appending B restarted from genesis while an existing anchor already used it. The reproduced transaction rolled back and retained B, so this is a repeated-archiving failure, not demonstrated data loss.

**Demo:** Run two or more archive cycles with new events between them, including a cycle that empties the main database. Every cycle succeeds, the dashboard lists each run, and verification succeeds on the resulting files.

- [x] Add a failing Seam B regression for archive-all, append a new session, then archive again before implementing the fix.
- [x] Repeat successfully into the same month's archive and into a later month's archive, including reopening the stores between cycles.
- [x] Cover removal of the chain's final rows while other sessions remain, then continued appends and another archive cycle.
- [x] Both main and archive files verify after each cycle; a missing or modified event within the retained chain is still detected. Do not hide conflicting anchors by ignoring insertion failures or disabling checks.
- [x] Existing event bodies and hashes remain unchanged. Record movement, anchor changes and the archive-run record remain transactional.
- [x] A failed archive leaves its session's events available and does not report a successful move. Open and recent sessions remain untouched.
- [x] (Manual run, not in the gate: three `tracevault run` cycles against a synthetic home, each archiving one new session; both files verify.) Demonstrate the actual archive startup path with a synthetic source, without importing the developer's real agent history, and the archive-run display through Seam A.
- [x] Preserve the documented limits of local hash-chain verification; this ticket adds no remote trust or authentication.
- [x] Typecheck, build and the full suite pass locally.
