# 11 — Every session OpenCode ever ran (history import)

**What to build:** The dashboard stops showing only sessions that happened after installation. TraceVault reads OpenCode's own session store and imports every session already on the machine — their titles, agents, start and end times, and every tool call, file edit and patch inside them — as normal events in the same store, with the same schema.

Import is idempotent: running it twice does not duplicate a single event. Sessions captured live and sessions imported from history appear in one list, indistinguishable to the reader except by their capture path.

`tracevault run` performs the import on startup (the common case: open the page, see everything), and `tracevault import` does it on demand. Both are read-only against the agent's store — TraceVault never writes to OpenCode's database.

**Blocked by:** 02 — Every tool type, with outcomes. 03 — Session boundaries and open sessions.

**Status:** ready-for-agent

- [x] `tracevault import` ingests every session in OpenCode's store, with title, agent, start and end
- [x] Every tool call inside those sessions becomes an event with the correct type and target
- [x] File edits and patch records become document-access events naming the files touched
- [x] Importing twice produces zero duplicates
- [x] The agent's database is opened read-only and never modified
- [x] Imported events carry `session_store` as their capture path, so live and historical data stay distinguishable
- [x] Seam test: a fixture copy of an agent database imports to the expected session and event counts
