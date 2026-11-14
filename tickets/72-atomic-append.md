# 72 — Two writers cannot break the hash chain

**What to build:** Appending reads the last hash, then inserts, as two separate statements. `tracevault import --db <file>` run while the service has the same file open can read the same last hash, and the chain is broken for good. One append becomes one write transaction, and a writer that finds the file busy waits briefly instead of failing.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Two stores open on one file, appending in turn, leave a chain the verifier accepts
- [ ] A writer that meets a held write lock waits and then succeeds, or fails without leaving a half-written row
- [ ] Removing the transaction fails the test
- [ ] Typecheck, build and the full suite pass
