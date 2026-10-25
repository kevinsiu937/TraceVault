# ADR 0002 — Capture on `tool.execute.after`

- **Status:** accepted for ticket 01 (measured; Kevin may amend)
- **Date:** 25 October 2026
- **Deciders:** Kevin Siu, Hui Siu Hin

## Context

Ticket 01 needs one bash tool call to become one stored event. Before writing the store, we measured the OpenCode plugin hook on the installed runtime (OpenCode 1.18.25, Windows). A probe plugin recorded every hook invocation to JSONL while an agent ran one shell command. Two runs were captured: `node mark.js`, which appended an execution marker, and `echo tracevault-fixture`. A third run, `cmd /c exit 1`, provided a non-zero exit.

The measurement answers three questions the ticket asked: when the hook fires, which identifiers it carries, and whether it carries a session sequence number.

### Firing point

| Run | `tool.execute.before` | Process starts | Process ends | `tool.execute.after` |
|---|---|---|---|---|
| `node mark.js` | 12:53:44.492Z | marker written 12:53:44.828Z | — | 12:53:44.878Z |
| `echo tracevault-fixture` | 13:01:28.758Z | 13:01:28.842Z | 13:01:29.023Z | 13:01:29.018Z |

`before` fires before the process starts. `after` fires after execution and carries the final result. The marker test proves ordering rather than relying on two clocks: the marker appeared between the two hooks. The run-2 completion timestamp (13:01:29.023Z) is written 5 ms after the `after` hook returned, so it is not evidence of ordering; the marker in run 1 is.

### Identifiers available

Both hooks receive `input`:

| Field | Example | Meaning |
|---|---|---|
| `tool` | `"bash"` | Tool name |
| `sessionID` | `"ses_e8cd974edffegftWNtrKV3BXUe"` | Agent session identity |
| `callID` | `"chatcmpl-tool-97b767f4350cf67d"` | Tool-call identity; equal across both hooks |
| `args` | `{ "command": "echo tracevault-fixture" }` | Tool arguments |

`after` additionally receives `output`:

| Field | Example |
|---|---|
| `title` | `"echo tracevault-fixture"` |
| `metadata.output` | `"tracevault-fixture\r\n"` |
| `metadata.exit` | `0` or `1` |
| `metadata.truncated` | `false` |
| `output` | same text as `metadata.output` |
| `attachments` | `[]` |

Neither hook provides a sequence number, a timestamp, a duration, or an agent name/version. The plugin context (`client`, `project`, `directory`, `worktree`, `experimental_workspace`, `serverUrl`, `$`) also exposes no agent version. Only `after` exposes the exit code, which is the outcome.

## Decision

Capture on `tool.execute.after`, one event per call, for `bash` only in ticket 01.

| Envelope field | Source |
|---|---|
| `type` | `"hook.script"` |
| `session_id` | `input.sessionID` |
| `correlation_id` | `input.callID` |
| `seq` | `null` — not provided by the hook |
| `timestamp` | Service clock at HTTP receipt, ISO 8601 UTC milliseconds |
| `agent` | `{ "name": "opencode", "version": "unknown" }` |
| `capture_path` | `"plugin_hook"` |
| `prev_hash` | `null` — assigned by the store in ticket 06 |

Event data:

```json
{
  "hook": "tool.execute.after",
  "target_tool": "bash",
  "target": "echo tracevault-fixture",
  "exit_code": 0,
  "outcome": "ok"
}
```

`outcome` is `"ok"` when `exit === 0`, otherwise `"error"`.

## Consequences

- Every stored event reflects a completed action, not an intention. A call that crashes the agent without returning leaves no event; ticket 07 turns that gap into an explicit `capture.gap` record.
- The receipt timestamp trails execution by roughly the hook latency (observed 50 ms in run 1 and within the same second in run 2). Ordering by receipt time can reorder concurrent calls. Ticket 05 owns real ordering; `correlation_id` already links both hooks for one call when a stricter order is needed.
- The CLI and dashboard are local, single-user, and append-only, so one writer needs no coordination.
- SQLite is `node:sqlite`, built in and dependency-free. The store opens it through Node's resolver because Vitest's bundled Vite predates the module. The tested runtime is Node 24, and `package.json` states that floor.
- The tool's stdout is not stored. Payload depth, digests and redaction are ticket 02's concern; `raw_extra` stays empty for this ticket, a knowing, temporary relaxation of schema rule 5.
- `data.target` stores the command text verbatim, including any secret typed on the command line. This is a local-disk exposure accepted for one ticket and removed by ticket 02's redaction rule.

## Deferred

| Item | Ticket |
|---|---|
| Sequence numbers, de-duplication, ordering fidelity | 05 |
| Hash chain and `prev_hash` | 06 |
| Session end (`session.end`, `ended_at`) | 03 |
| Payload depth, digests, `raw_extra`, command redaction, non-bash tools | 02 |
| Capture gaps when the service is unavailable | 07 |

## Alternatives rejected

- **Capture on `before`:** it identifies the call but not its outcome, and it cannot record an exit code. A representative timeline needs the result.
- **Capture both hooks, merge at read time:** two records per ordinary call doubles storage to prove a fact (`callID`) that `after` already carries. Correlation stays available for future paths that genuinely observe different things.
- **Read OpenCode's session store instead of hooking:** the hook is the supported extension point; the persisted store is undocumented and would couple the capture layer to an implementation detail.
