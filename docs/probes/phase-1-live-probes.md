# Phase 1 live probes — ticket 14

Measured 26 Oct 2026 on Windows, OpenCode 1.18.25, Node 24.20.0.
Method: the installed plugin posts to `127.0.0.1:4319`; a tee logs every raw body
(`data/probe14-hook.jsonl`) and forwards it to the service on `127.0.0.1:4320`.
Nothing in this file is invented: every payload quoted was observed.

## 02 — permission denial

Command (no `--auto`, so an `ask` rule cannot be approved):

```bat
opencode run "Use the bash tool to run exactly this command: curl -s http://127.0.0.1:4320/ . Then reply DONE."
```

Terminal result:

```
! permission requested: bash (curl -s http://127.0.0.1:4320/); auto-rejecting
✗ curl -s http://127.0.0.1:4320/ failed
Error: The user rejected permission to use this specific tool call.
```

Raw hook body forwarded to the service (unscrubbed shape):

```json
{"hook":"tool.failed","input":{"tool":"bash","sessionID":"ses_…","callID":"call_…","args":{"command":"curl -s http://127.0.0.1:4320/"}},"error":"The user rejected permission to use this specific tool call."}
```

Stored result, read back from the page:

```
<li class="event" data-event-id="evt_01M5W7C8QETCPC6KECTM4T8MSQ"
    data-time="2026-10-26T13:46:10.542Z" data-kind="hook.script" data-outcome="denied">
pill denied
```

So a denial arrives through `message.part.updated` (status `error`) → the plugin's
`tool.failed` payload, never through `tool.execute.after`. `DenialSignal` matches the
message text; `outcome` is stored as `denied`.

Frozen as `tests/fixtures/tool-failed-denied.json` (session/call ids and the command
scrubbed). Pinned by seam B: `tests/seams/capture.seam.test.ts` →
"records a live permission rejection as denied, not as an error". Negative control:
with `DenialSignal.isDenial` forced to `false`, that test alone fails; restored, green.

## 07 — service down across a whole session (red)

Sequence: session A captured live → service stopped (tee left up) → session B run
entirely while down → service restarted on the same DB → session C run.

Observed in the store:

| session | events | capture paths |
|---|---|---|
| A | 6 | `plugin_hook` x3 + `session_store` x3 |
| B | 3 | `session_store` x3 only |
| C | 3 | `plugin_hook` x3 (plus `session_store` after the next restart) |

Two facts that matter:

1. **The gap is lost.** Session B's process set an in-memory pending gap, then exited;
   no `capture.gap` was ever stored. The plugin's `pendingGap` only flushes on the next
   successful send *in the same process*.
2. **Backfill hides the outage.** On restart, history import re-read the agent's own
   store and reconstructed B's actions. B is therefore not empty — it looks like a
   normally covered session with no indication that live capture was absent.

Consequence: ticket 07's remaining box cannot be closed by the current design. A
durable pending-gap file plus an `uncovered` marker is required, and the import must not
double sessions it already saw live (see below).

## 07 — green re-run after the fix

Same sequence. State file after B, read from disk after B's process exited:

```json
[{"sessionID":"ses_e87712b0affeFVAiuAKRPpufXB","from":"2026-10-26T14:13:09.107Z","lastFailureAt":"2026-10-26T14:13:32.598Z"}]
```

State file after C: `[]`. Stored events for B:

```
14:13:08.981 session_store session.start
14:13:26.880 session_store hook.script
14:13:32.598 plugin_hook   capture.gap   reason=capture endpoint unavailable to=14:13:32.598Z
14:13:32.600 session_store session.end
```

List row: `… ses_e87712b0affeFVAiuAKRPpufXB opencode 2026-10-26T14:13:08.981Z uncovered 1`.
Session page: gap row present, `data-outcome="gap"`, reason rendered.

The gap is stamped at `to`, so it sorts between the actions on either side of the outage.
Fixture: `tests/fixtures/capture-gap-service-down.json`.

## 08 — scroll and position, measured

Chrome headless over CDP, 1010-row session, real server code, an event recorded with an
earlier receipt time while the page was scrolled to the middle:

```json
{"before":{"scrollY":4000,"anchorTop":37.9,"rows":1010},
 "after":{"scrollY":4065,"anchorTop":37.5,"rows":1011,"navigations":1},
 "insertedAboveViewport":true,"scrollShift":65,"anchorMoved":0.4,"rowsAdded":1}
```

The earlier event landed first in the DOM. scrollY moved by exactly the inserted row's
height, so the row the reader was looking at stayed still (0.4px). One navigation entry,
one row added: no reload, no duplicate.

Out-of-order *live* arrival cannot occur: the service stamps receipt time, so hook events
are monotonic. The position contract is proven at seam A with an injected earlier receipt.

## Adjacent defect found by the same probe

A session captured live gains a second copy of every event after the next restart:

```
13:50:13.885 plugin_hook   hook.script corr=call_00_ET_qxpJBDXSdZTLaQxwkGJ25683
13:50:13.910 session_store hook.script corr=session_store:prt_17879d7e4001ixiOTj1u7ASBKL
```

The agent's stored part carries the same `callID` as the live hook
(`call_00_ET_qxpJBDXSdZTLaQxwkGJ25683`), but `ImportedPartMapper` used `session_store:prt_…`,
so read-time de-duplication never linked the two. Every restart doubled live actions and
session boundaries. Fixed: import correlates on the part's `callID`, and skips a boundary
when a `plugin_hook` boundary already exists. Seam B case: a live-captured session then
imported yields one `echo fixture` action and one start/end. Negative control (both changes
reverted) fails with `['echo fixture', 'echo fixture']`.

## 21 — prompt turns (probe only)

Two prompts in one session (`opencode run "…"`, then `opencode run -s <session> "…"`),
with a probe plugin logging every `chat.message` and `message.*` event.

`chat.message` fires with the user message in `output`:

```json
{"message":{"id":"msg_1789f573d00174zGId2pvZfWf9","role":"user",
            "sessionID":"ses_e8760adc3ffejCKQKN412f46F7",
            "time":{"created":1793025070909}},
 "parts":[{"type":"text","text":"Reply with exactly PROBE-ONE …"}]}
```

Both turns produced one such call with a distinct `messageID` and `time.created`
(`msg_1789f573…` at 1793025070909, `msg_178a0456…` at 1793025131879). So a prompt is
identifiable by `messageID` + `created`, and the text is available in `parts`.

Caveat worth knowing: this harness also sends a second role-`user` message per turn
containing a `<available-skills>` block. It is indistinguishable structurally from a typed
prompt, so a future turn grouping should treat harness-injected blocks as debt rather than
assume one user message per turn.

No production code was written for this yet; ticket 21's remaining work is the prompt
event type, the plugin hook, and the seam-B fixture.

## Environment notes

- A fresh SQLite database under `D:\hermes\projects\tracevault\data\` stalls the CLI's
  bulk history import indefinitely; the same DB under `%TEMP%` starts in under a second.
  Probes use `%TEMP%`. Not a product bug for an empty store, but worth knowing for demos
  on this machine.
- The pending-gap file originally lived under `~/.local/share/tracevault/`; on this
  machine that path hit EPERM (a leftover `.tmp` showed the atomic rename failing), so the
  store now falls back to a direct write, recovers from a leftover `.tmp`, and defaults to
  `%LOCALAPPDATA%\tracevault\` on Windows (`~/.local/state` elsewhere).
- Probes must be serial: one service, one tee, one OpenCode process. A second concurrent
  `opencode run` did not start under the nested runner.
- `opencode run --agent build` falls back to the default agent; both forms were tried and
  matched. The rejection comes from the permission map, not from the agent choice.
