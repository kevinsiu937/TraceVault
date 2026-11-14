# 66 — Trust an MCP tool when first seen, flag a later change

**What to build:**
- A new static check, `changed_since_first_seen`, compares each tool with its server's first recorded tool list: a changed description or input schema, or a tool that list lacked. A new rule, `rules/config/tool-changed.yaml`, uses it.
- The baseline is the earliest `mcp.tools` event per server, which the store already keeps, so no new table and no backfill are needed.

**Blocked by:** 41, 55.

**Status:** done

- [x] A first sighting raises nothing (Seam B)
- [x] A later session's changed description names the server, the tool, what changed and when the server was first seen, and still does after the database is reopened (Seam B)
- [x] A change within the session that first saw the server counts; a removed tool does not (Seam B)
- [x] Trigger and clean fixtures; reordered schema keys do not count as a change (Seam C)
- [x] The loader rejects the check on a non-tool subject, or with a value other than true
- [x] Dropping the earlier sessions' lists fails the Seam B test
- [x] Typecheck, build and the full suite pass

**Technical notes:** ticket 59 (archive) must keep each server's first tool list in the main database, or the baseline moves. Every later session reports a changed tool again, because there is no way yet to accept a change.
