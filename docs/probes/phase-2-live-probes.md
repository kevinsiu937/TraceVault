# Phase 2 live probes

Recorded on 7 November 2026 against OpenCode 1.18.32 on macOS. The probe was a project-local plugin in a throwaway folder (`.opencode/plugin/probe.js`). It logged the plugin context and every `event` hook to JSON lines, using the free `opencode/big-pickle` model.

## 31: where a session's project folder comes from

**Run:** `opencode run "Reply with the single word ok. Do not use any tools."` in a folder that is not a git repository.

| Source | Value |
|---|---|
| plugin context `directory` | the folder `opencode run` started in |
| plugin context `worktree` | `/` (outside git; `project.id` is `global`) |
| `session.created` → `properties.info.directory` | the session's own folder |
| `session.created` → `properties.info.parentID` | absent for a root session |

**Decision:** the live path forwards `info.directory` from `session.created`, which is per session. The plugin context is per OpenCode instance, and its `worktree` is wrong outside git. A resumed session emits no new `session.created`, so its folder stays the one recorded when it was created. The import path reads `session.directory`, which is `NOT NULL` in the store schema. The frozen fixture is `tests/fixtures/event-session-created.json`, with the path scrubbed.

**Not probed:** a subagent's `session.created`, and resuming a session from a different folder. Both need a run in which the agent uses a tool. Claude Code's safety check refused a run with `--auto` (auto-approved permissions), so neither was observed. Expected: a subagent's `session.created` carries its own `info.directory`. Unproven.

The model reply stalled after the events above were logged, so the run was stopped. The events needed were already recorded.

## 32: permission grants

**Static evidence only.** The installed `@opencode-ai/plugin` 1.18.32 declares a `permission.ask` hook, `(input: Permission, output: { status: "ask" | "deny" | "allow" })`. Its SDK declares permission events in two shapes:

| SDK types | Asked | Replied |
|---|---|---|
| `sdk/dist/gen` | `permission.updated` (properties: `Permission`, with `id`, `type`, `pattern`, `sessionID`, `callID`, `title`) | `permission.replied` (`sessionID`, `permissionID`, `response`) |
| `sdk/dist/v2/gen` | `permission.asked` (`PermissionRequest`, with `permission`, `patterns`, `always`, `tool.callID`) | `permission.replied` (`sessionID`, `requestID`, `reply: "once" \| "always" \| "reject"`) |

Which shape this runtime sends to a plugin is the open question, and per `AGENTS.md` it must be observed, not guessed. `docs/probes/scripts/permission-probe.sh` runs OpenCode interactively with a logging plugin. Approve the one prompt it shows, and the script prints every permission record it received.

**Recorded run (10 Nov 2026, OpenCode 1.18.32, DeepSeek selected).** Kevin ran the interactive permission probe and approved the prompts himself. The plugin received the v2 event shapes. The ten permission events are frozen in `tests/fixtures/permission-grants.json`, marked `recorded` and checked for local paths.

- `permission.asked` carries `id`, `sessionID`, `permission`, `patterns`, `metadata`, `always`, and `tool` (`messageID`, `callID`).
- `permission.replied` carries `sessionID`, `requestID`, and `reply`. Join it to the request by session and request id.
- The first four replies are `once`: `ls`, `pwd`, `ls -a`, and `date`. The fifth request, another `date`, received `always`.
- For `date`, the request's `patterns` is `["date"]`, while its `always` patterns are `["date *"]`. These are different scopes and must not be conflated.
- The reply itself supplies no scope. A capture implementation must retain the matching asked event, use `patterns` for `once` and `always` for `always`, and ignore rejected replies.

The probe proves that grant events reach plugins. It does not prove TraceVault stores them or that an escalation rule works. Both remain unimplemented. The proposed `admin.grant` schema needs Kevin's approval before implementation because the existing draft's expiry and review fields are absent from the recorded payload. Ticket 32 later stored grants as `admin.grant` and added the `escalation-then-use` rule; see the ticket for the format Kevin approved.

## 34: what a refused call looks like

Blocking must not be built on a guessed hook behaviour. `docs/probes/scripts/refusal-probe.sh` starts one `opencode run` session in a throwaway workspace. A logging plugin throws in `tool.execute.before` for any edit or write that names `opencode.json`. The agent is asked to edit `opencode.json`, read `README.md`, and quote any error it received. The plugin logs every hook and event to `<output-dir>/events.jsonl`, with full tool and text parts.

The run answers the ticket's questions from the log:

- Whether the model sees the refusal's message, from the tool part's `state.error` and the model's reply.
- Whether a failed-tool event fires, from a `message.part.updated` tool part with `status: "error"`.
- Whether `tool.execute.after` fires for the refused call.
- Whether the turn continues after a refusal, from whether `ls` still runs.
- Whether the model retries the refused edit.
- Whether `WorkflowScannerAssembly`, and so the `yaml` package, loads inside OpenCode's plugin runtime, from the `"probe":"scanner"` line.

The script also reports whether `opencode.json` stayed unchanged. Scrub local paths before freezing any of the log into `tests/fixtures/`.

**Run 1 (10 Nov 2026, OpenCode 1.18.32, `deepseek/deepseek-flash`).** The refusal was not observed. Before any edit, the model ran `ls -la` and a `glob` in parallel. Only a bare `ls` was allowed, so `ls -la` asked, `opencode run` rejected it, and the session went idle without attempting the edit. `opencode.json` stayed unchanged. The run still settled three facts:

- `WorkflowScannerAssembly` loads `rules/` inside the plugin runtime, which is Bun 1.3.14. The `yaml` package works there.
- `tool.execute.before` fires before the permission check. The hook logged the `ls -la` call, and `permission.asked` followed it.
- `tool.execute.after` does not fire for a call whose permission was rejected. The call shows only as a `message.part.updated` tool part with `status: "error"` and its full input.

The script now allows `ls` with any flags, plants `README.md`, and asks the agent to read it instead of using the shell.

**Run 2 (10 Nov 2026, same setup).** The refusal was observed in session `ses_e3bb5ec00ffeVYcqVTHMGkjwWL`.

- The model sees the reason. OpenCode returned the thrown error as the tool result, and the model quoted "TraceVault probe refused this call: opencode.json is protected." word for word.
- A failed-tool event fires. The edit's tool part went `pending`, `running`, then `error`, with the thrown message in `state.error` and the full arguments in `state.input`. TraceVault's existing `event` hook already turns such a part into a `tool.failed` capture.
- `tool.execute.after` does not fire for the refused call.
- The turn continues. The next call, a read of `README.md`, ran normally, and no `session.error` fired.
- The model did not retry the refused edit.
- `opencode.json` stayed unchanged.

The refused call is frozen, with paths scrubbed, in `tests/fixtures/tool-refused-by-hook.json`.

One consequence for the build: the thrown message is the only thing about the refusal that reaches capture. `DenialSignal` treats an error as a denial by its wording (denied, permission, rejected, not allowed, blocked). The probe's wording ("refused") would be stored as an error, not a denial. The guard's message therefore needs a word `DenialSignal` recognises, and the rule id.

## Live runs this machine could not make

On 7 November 2026 every free model returned `AI_APICallError: Free usage limit reached`, and no provider credentials are configured. Separately, Claude Code's safety check refused an unattended run with `--auto`. Tickets 32, 33 and 34 each need a tool-using agent run, so a person with model access runs the scripts in `docs/probes/scripts/`:

- `permission-probe.sh` for ticket 32 (interactive; approve one prompt).
- `phase-2-exit-run.sh` for ticket 33 (unattended, with narrow permissions). It freezes both sessions into `tests/fixtures/rules/phase-2-exit/`.
- `refusal-probe.sh` for ticket 34 (unattended, with narrow permissions). See the section on ticket 34 above.

## Earlier note: probes that need a tool-using agent run

Ticket 32 needs a granted permission, and ticket 34 needs a refused tool call. Ticket 33 needs a scripted session that edits config, reads a planted `.env`, makes requests and deletes a file. Each needs an OpenCode agent that actually uses tools. An unattended run of that kind was refused by Claude Code's safety check ("Create Unsafe Agents"), so these runs are left to a person to start. The scripts are in `docs/probes/scripts/`.
