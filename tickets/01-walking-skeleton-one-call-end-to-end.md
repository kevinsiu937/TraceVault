# 01 — Walking skeleton: one tool call, end to end

**What to build:** The thinnest complete path through every layer. OpenCode makes one tool call; the plugin hook reports it to the local service; the service stores it; the dashboard lists the session it belongs to. One event type is enough — bash is the natural choice because it is the most visible thing an agent does.

This ticket is the project's tracer bullet. Its job is to prove the wiring, not the features: if one call can travel hook → service → store → page, every later ticket is filling in a path that already exists.

While wiring it, measure and record what the hook actually provides: does it fire before or after execution, does it carry a tool-call identifier, a session identifier, and any sequence number. Ordering and de-duplication in later tickets depend on the answer, so write the finding down where the next ticket can read it.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A real OpenCode session that runs one shell command produces exactly one stored event
- [ ] The session appears in the dashboard's session list on `127.0.0.1`
- [ ] The event carries type, target, outcome, timestamp, session identity and agent identity
- [ ] The hook's firing point and available identifiers are recorded in the repo's design notes
- [ ] The first seam-B test exists: a recorded payload in, the expected stored event out, written beside the code and passing
- [ ] `npm run build`, `npm run typecheck` and `npm test` all pass
