# 94 — Nothing is lost while the service is down

**What to build:** When the plugin cannot deliver a payload, it appends it to its own outbox file (owner-only, in the state folder) instead of dropping it, and sends the outbox in order on the next delivery that succeeds. Every payload carries `observedAt`, which the capture stage uses as the event's time. The outbox holds at most 10 MB; past that the oldest are dropped and a gap says so. A file left by an exited process is sent by the next process that delivers.

Spec: `docs/spec/outbox.md` (approved 17 Nov 2026).

**Blocked by:** none.

**Status:** done (17 Nov 2026).

**Live run (17 Nov 2026, OpenCode 1.18.32 under Bun, deepseek-flash, Kevin's run, twice):** with the service stopped, a prompt and `curl -sI https://example.com` went to the outbox (mode 600). The first run left 4 files from one process: every failed drain renamed the process's own file, fixed so an outage leaves at most two; another process also sent an exited process's newest file first, fixed to oldest first. On the second run, 2 files; after the service started and a second `opencode run` delivered, the outbox was empty, session 1's events (prompt, `net.connect`, bash call, end) arrived in order at their observed times, and `verify` passed. Accepted, not caused by the outbox: a second `config.snapshot` when two sends race before the preamble is marked delivered (a known shortcut in `SessionPreamble`), a second `session.end` when OpenCode sends `session.idle` twice, and a `capture.duplicate` when the history import already holds the call.

- [x] With the service refusing, payloads go to an outbox file with permission 600; when it answers, they are stored in order, at their observed times, before the next payload (Seam B)
- [x] `observedAt` is the event's time when valid and not after the time received (+5 s); otherwise the time received; payloads with their own time keep it (Seam B)
- [x] Past 10 MB the oldest payloads are dropped and one gap, reason "outbox full", covers their times (Seam B)
- [x] A file left by an exited process is sent once, by another process (Seam B)
- [x] A write that fails never reaches the agent, and falls back to today's gap
- [x] The timeline shows late events in their place (Seam A); `tracevault verify` passes
- [x] Kevin's live run: service stopped, a prompt and a bash call with a connection, service started; the session is complete and in order
- [x] Typecheck, build and the full suite pass
