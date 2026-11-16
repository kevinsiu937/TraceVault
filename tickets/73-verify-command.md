# 73 — `tracevault verify` checks the record

**What to build:** Every event carries the hash of the one before it, but nothing a user can run checks the chain: the verifier is reached only from tests. `tracevault verify [--db <path>]` prints that the record is intact, or the session, position and reason of the first break, and exits non-zero on a break.

**Blocked by:** 72 (so a chain broken by two writers is not reported as tampering).

**Status:** done

- [x] An untouched database prints that it is intact and exits 0 (through the CLI)
- [x] A database with one edited row names the session and the reason and exits 1
- [x] The usage text lists the command
- [x] Typecheck, build and the full suite pass

**Technical notes:** `verify` refuses a path with no database instead of creating one. Opening a database still migrates it (ticket 55), which adds tables and never touches an event row. The chain has no anchor outside the file: someone who rewrites every hash after the edited row is not caught. That limit is unchanged.
