# 58 — Store repeated configurations and tool lists once

**What to build:** each session stores a full configuration snapshot and every tool list, though they rarely change between sessions. Store each by digest once and keep the digest in the event. Old events are not rewritten.

**Blocked by:** 55, 56. **Waiting on ticket 56's numbers:** built only if they show these events take a large share of the database.

**Status:** not needed (ticket 56: 2.2 KB per session, under 1% of a 300-event session)
