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

## 32: permission grants (not yet run)

**Static evidence only.** The installed `@opencode-ai/plugin` 1.18.32 declares a `permission.ask` hook, `(input: Permission, output: { status: "ask" | "deny" | "allow" })`. Its SDK declares permission events in two shapes:

| SDK types | Asked | Replied |
|---|---|---|
| `sdk/dist/gen` | `permission.updated` (properties: `Permission`, with `id`, `type`, `pattern`, `sessionID`, `callID`, `title`) | `permission.replied` (`sessionID`, `permissionID`, `response`) |
| `sdk/dist/v2/gen` | `permission.asked` (`PermissionRequest`, with `permission`, `patterns`, `always`, `tool.callID`) | `permission.replied` (`sessionID`, `requestID`, `reply: "once" \| "always" \| "reject"`) |

Which shape this runtime sends to a plugin is the open question, and per `AGENTS.md` it must be observed, not guessed. `docs/probes/scripts/permission-probe.sh` runs OpenCode interactively with a logging plugin. Approve the one prompt it shows, and the script prints every permission record it received.

## Live runs this machine could not make

On 7 November 2026 every free model returned `AI_APICallError: Free usage limit reached`, and no provider credentials are configured. Separately, Claude Code's safety check refused an unattended run with `--auto`. Tickets 32, 33 and 34 each need a tool-using agent run, so a person with model access runs the scripts in `docs/probes/scripts/`:

- `permission-probe.sh` for ticket 32 (interactive; approve one prompt).
- `phase-2-exit-run.sh` for ticket 33 (unattended, with narrow permissions). It freezes both sessions into `tests/fixtures/rules/phase-2-exit/`.
- Ticket 34's refusal probe: run `phase-2-exit-run.sh` after `tracevault init --block` (see ticket 34).

## Earlier note: probes that need a tool-using agent run

Ticket 32 needs a granted permission, and ticket 34 needs a refused tool call. Ticket 33 needs a scripted session that edits config, reads a planted `.env`, makes requests and deletes a file. Each needs an OpenCode agent that actually uses tools. An unattended run of that kind was refused by Claude Code's safety check ("Create Unsafe Agents"), so these runs are left to a person to start. The scripts are in `docs/probes/scripts/`.
