# 59 — Archive old sessions automatically

**What to build:** on start, the service moves sessions that ended more than 90 days ago (configurable; 0 turns it off) into a monthly archive file, keeps an anchor holding the last hash of the moved chain so both files still verify, runs VACUUM, and lists each archive run on the dashboard. `tracevault report` can read an archive. Open sessions are never moved.

**Blocked by:** 55, 56.

**Status:** done. Kevin gave the go on 16 Nov 2026 to build it now, without waiting on a real database's numbers.

**Constraint from ticket 66:** a server's first tool list is its earliest `mcp.tools` event. An archive must keep each server's first tool list in the main database, or tool-changed's baseline moves.

**Constraint from ticket 85 (built in parallel, merged 16 Nov 2026):** an archive also keeps any `mcp.tools` event an `mcp_trust` row points to. `SqliteSessionArchive.closedBefore` keeps the session that holds it, the same way it keeps a server's first list (Seam B test). 85's `mcp_trust` is migration 3; 59's tables are migration 4.

- [x] On start, `tracevault run` moves every session whose last event is its end, more than 90 days before now, into `<db>-archive-<YYYY-MM>.db` beside the database, with every event unchanged (Seam B)
- [x] Open sessions and recently ended sessions stay (Seam B)
- [x] `--archive-after <days>` sets the age; 0 turns archiving off and creates no file; a negative or non-number value is refused (Seam B, CLI)
- [x] Both files verify after one run and after a second run into the same month's file, with sessions interleaved; an event removed by hand afterwards is still caught (Seam B)
- [x] `tracevault verify --db <archive>` checks an archive file (Seam B)
- [x] The database is vacuumed, so the moved sessions' space is returned (Seam B)
- [x] The session that holds each MCP server's first tool list stays, so `tool-changed` keeps its baseline; moving it fails the test (Seam B)
- [x] An archived session is not imported again from the agent's own store (Seam B)
- [x] `tracevault report <id> --db <archive>` writes an archived session, with the rules it was recorded under (Seam B)
- [x] The session list names each archive run: when, how many sessions and events, and the file (Seam A)
- [x] Typecheck, build and the full suite pass

**Technical notes:**
- The hash chain is one chain over every row, not one per session, so moving a session leaves gaps in both files. Each gap gets a row in `chain_anchors (from_hash, to_hash)`: in the database, from the hash before a run of moved rows to the last hash of that run; in the archive, from its last hash to the hash a newly added row links to. `StoreVerifier` follows anchors when a link does not match, so both files verify on their own. The anchor table is outside the chain: `verify` trusts it, as it trusts nothing else.
- Moving is one transaction over both files (`ATTACH`), so a crash leaves the sessions in one file or the other, never both or neither. `archived_sessions` records each moved session; the dashboard groups it into runs and the history import skips it.
- The setting is a `run` flag, `--archive-after <days>`, default 90, like `--port`. No config file exists to put it in.
