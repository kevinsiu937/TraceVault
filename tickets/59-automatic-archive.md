# 59 — Archive old sessions automatically

**What to build:** on start, the service moves sessions that ended more than 90 days ago (configurable; 0 turns it off) into a monthly archive file, keeps an anchor holding the last hash of the moved chain so both files still verify, runs VACUUM, and lists each archive run on the dashboard. `tracevault report` can read an archive. Open sessions are never moved.

**Blocked by:** 55, 56. **Waiting on ticket 56's numbers:** built only if they show the database grows enough to need it.

**Status:** waiting. Ticket 56's synthetic numbers (about 0.9 KB per event) do not call for it alone; measure a real database and the session list first.

**Constraint from ticket 66:** a server's first tool list is its earliest `mcp.tools` event. An archive must keep each server's first tool list in the main database, or tool-changed's baseline moves.
