# 73 — `tracevault verify` checks the record

**What to build:** Every event carries the hash of the one before it, but nothing a user can run checks the chain: the verifier is reached only from tests. `tracevault verify [--db <path>]` prints that the record is intact, or the session, position and reason of the first break, and exits non-zero on a break.

**Blocked by:** 72 (so a chain broken by two writers is not reported as tampering).

**Status:** ready-for-agent

- [ ] An untouched database prints that it is intact and exits 0 (through the CLI)
- [ ] A database with one edited row names the session and the reason and exits 1
- [ ] The usage text lists the command
- [ ] Typecheck, build and the full suite pass
