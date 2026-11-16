# 72 — Two writers cannot break the hash chain

**What to build:** Appending reads the last hash, then inserts, as two separate statements. `tracevault import --db <file>` run while the service has the same file open can read the same last hash, and the chain is broken for good. One append becomes one write transaction, and a writer that finds the file busy waits briefly instead of failing.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] Two stores open on one file, appending in turn, leave a chain the verifier accepts
- [x] A writer that meets a held write lock waits and then succeeds, or fails without leaving a half-written row
- [x] Removing the transaction fails the test
- [x] Typecheck, build and the full suite pass

**Technical notes:**
- The test starts three processes that append 100 events each to one file, released together. Before the fix two of them died with "database is locked"; with the wait but without the transaction the verifier found a broken link, which is the fork this ticket is about.
- An append is `BEGIN IMMEDIATE` … `COMMIT`, with a 5 s busy wait set when the store opens.
- Not covered: the duplicate record (two appends for one repeated call) is still two transactions.
