# Spec: nothing is lost while the service is down (ticket 94)

> Status: **approved 17 Nov 2026** (Kevin: option 甲, the plugin keeps what it cannot send).
> Kevin decided on 17 Nov 2026:
> - every payload carries the time the plugin observed it, and the service stores that time;
> - the outbox holds at most 10 MB; past that the oldest payloads are dropped and a gap says so.

## Problem Statement

The plugin posts each payload to the service the moment it happens. When the service is not running, or does not answer within 2 s, the payload is dropped and only a `capture.gap` ("from … to …") is recorded once delivery works again. `run` imports OpenCode's own history on start, which recovers part of the tool calls. Nothing recovers the rest: shell connections (`net.connect`), calls the guard skipped, permission answers, configuration snapshots and MCP tool lists exist only in the plugin's payloads.

## Solution

A payload the plugin cannot deliver goes into an outbox file instead of being dropped. On the next delivery that succeeds, the plugin first sends what the outbox holds, oldest first, then the new payload. Each payload carries the time the plugin observed it, so a payload sent late is stored at the time it happened, not the time it arrived.

## User Stories

1. As a developer, I want what the agent did while the TraceVault service was down to appear when the service is back, so that forgetting to start it loses nothing.
2. As a developer, I want those events at the time they happened, in order, so that the timeline reads as it would have live.
3. As a developer, I want TraceVault never to fill my disk or slow my agent, even if the service stays down for days.
4. As a developer, I want to be told plainly when something was dropped anyway.

## Implementation Decisions

**Observed time.** The plugin adds `observedAt` (ISO 8601) to every payload it sends, delivered at once or later. The capture stage uses it as the event's time when it is a valid date no later than the time received (plus 5 s for clock jitter); otherwise it keeps the time received, as today. Payloads that already carry their own time (`chat.message`'s `createdAt`, a gap's `from` and `to`) keep it. A payload without `observedAt`, from an older plugin, is stored as today.

**The outbox.** One file per plugin process, in the state folder beside the gap state: `tracevault/outbox/<process id>-<start time>.jsonl`, one payload per line, written with permission 600 (owner only) because payloads hold prompts and commands. Appending a line is the only write while the process runs. A file left by a process that has exited is sent by the next process whose delivery succeeds, so nothing waits for the same OpenCode window to come back. A process claims such a file by renaming it before sending, so two processes never send the same file.

**Order.** While the outbox holds anything, a new payload is appended to it rather than sent ahead of it; a successful delivery then sends the outbox in order. The preamble a session sends first (its configuration snapshot) goes through the same path, so it is never overtaken.

**Limits.** The outbox holds at most 10 MB in total. Past that, the oldest payloads are dropped until the new one fits, and a `capture.gap` covering the dropped payloads' observed times is recorded with the reason "outbox full". When the outbox cannot be written at all (disk full, permission), the payload is dropped and the existing gap path records it, as today. Neither ever reaches the agent: a failed write is swallowed like a failed send.

**Duplicates.** A payload whose delivery timed out may have been stored anyway; sending it again from the outbox stores a `capture.duplicate`, as for any duplicate observation today. Nothing new is needed.

**What does not change.** The hash chain, the event schema (the event's `timestamp` is its time, as before), the service's routes, and the gap state file. The service needs no knowledge of the outbox.

## Testing Decisions

- **Seam B:** with the service refusing, payloads go to the outbox file with permission 600; when it answers, they are stored in order, at their observed times, before the next payload, and `tracevault verify` passes.
- **Seam B:** a payload with `observedAt` is stored at that time; one in the future, invalid or absent is stored at the time received.
- **Seam B:** past 10 MB the oldest payloads are dropped and one gap with reason "outbox full" covers their times.
- **Seam B:** a file left by an exited process is sent by another process, once.
- **Seam A:** the session page shows late events in their place on the timeline, not at the restart time.
- **Live (Kevin):** stop the service, use OpenCode (a prompt, a bash call with a connection), start the service: the session is complete and in order.

## Out of Scope

- Starting the service automatically (launchd, systemd): a separate decision.
- Encrypting the outbox. It holds what the database holds, under the same owner-only permission.
- Sending the outbox without a new payload (a timer). It is sent on the next delivery that succeeds, which is the next thing the agent does.

## Known Blind Spots

- **The outbox is sent on the next event.** An OpenCode window that does nothing more after the service starts leaves its outbox until any OpenCode window does something.
- **Payloads past 10 MB are dropped**, oldest first; a gap records when.
- **The observed time is the plugin's clock.** It is the same machine as the service, so they agree, but a payload is never stored later than it was received.
- **An outbox file can be read by the owner**, like the database.
