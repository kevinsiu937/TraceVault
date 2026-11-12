# 34 — Opt-in blocking: refuse before it runs

**What to build:** An install option that turns on blocking. With it on, the plugin's pre-call hook classifies the pending call, evaluates the blockable rules locally, and refuses a positive match before the tool runs. Blockable rules: self-modification, and a sensitive-read rule that uses the exfiltration chain's named path list. Scope drift is not blockable: it binds the project folder in a first step, and only one-step rules can block. A default install never blocks.

**Blocked by:** 33.

**Status:** done

- [x] Probe first: record what OpenCode does when the pre-call hook refuses. Does the model see the reason? Does a failed-tool event fire? Does the after hook fire?
- [x] The loader accepts `blockable: true` only on a rule with one step that does not test the outcome
- [x] With blocking on, a write to `opencode.json` is refused, the file is unchanged, and the timeline shows the call as `denied` with the rule id and its flag
- [x] An unprotected call passes untouched
- [x] A broken rule set, or a guard that throws internally, lets the call through and records a `guard.failure` meta event naming the call, so an unenforced call is visible as data
- [x] With blocking off, the pre-call hook never refuses anything
- [x] Uninstall still restores the agent configuration byte for byte
- [x] A refused call's `denied` event carries the rule id in its data, and the schema doc says where
- [x] Seam B through the plugin hooks covers each case above

**Technical notes:** The plugin reaches the scanner through its port. One typed assembly module builds the scanner, and both the CLI root and the generated plugin loader call it, so a new match condition is registered once. The pre-call classification reuses `ToolClassifier`, not a copy. Decide in this ticket whether the guard's own refusals count toward the probing rule. Evaluation is local with no network call, because the service may be down. Check that the `yaml` package loads inside OpenCode's plugin runtime before building on it. The sensitive path list is the named list from ticket 28, referenced, not copied.

**Guard (11 Nov 2026):** `tracevault init --block` writes a plugin loader that builds the guard through `GuardAssembly`; plain `init` writes the same loader as before, which never refuses. Before each call, `CallGuard` classifies it with `ToolClassifier` and asks the scanner port's new `blockedBy` for the first blockable rule it matches. A match throws "TraceVault blocked this call: it matches the blockable rule '<id>'." The plugin remembers the rule, and the error part OpenCode then reports is stored as `denied` with `blocked_by` in its data. The rules load on the first call, inside the guard: rules that will not load, or any error while deciding, let the call through and send a `guard.failure` event with the tool, call id and reason. Blockable rules: `self-modification`, and the new `sensitive-read` (severity low), which reads the `sensitive-paths` list. The loader also refuses `blockable` on a repeated step, since a repeat needs more than the pending call.

Decisions taken with the defaults proposed to Kevin on 11 Nov 2026, since he asked for the ticket to be finished:
- The guard's own refusals count toward probing. They are ordinary `denied` events; a Seam B test pins it.
- The rule id lives in the refused call's `data.blocked_by`. `docs/EVENT-SCHEMA.md` documents it.
- `sensitive-read` was added as the ticket says. It flags every read of a listed file, on installs without blocking too.

"The file is unchanged" rests on the probe: when the pre-call hook throws, the tool never runs. The seam tests cannot run a real edit. Limits: only the file tools are guarded, so a shell command that writes `opencode.json` or prints `.env` passes. Verified by hand: after `npm run build`, `init --block` into a temporary folder, then importing the generated loader in Node refused an `opencode.json` edit and a `.env` read and allowed a `README.md` read. Run live on 12 Nov 2026 (OpenCode 1.18.32, `deepseek/deepseek-flash`, steps in `docs/DEMO.md`): the edit of `opencode.json` was refused before it ran, the file stayed unchanged, and the stored event is `denied` with `blocked_by: self-modification`.

**Probe (10 Nov 2026):** `docs/probes/scripts/refusal-probe.sh`, run twice on OpenCode 1.18.32 with `deepseek/deepseek-flash`. The full record is in `docs/probes/phase-2-live-probes.md`. When the pre-call hook throws, the model sees the thrown message as the tool result. The tool part ends in `error` carrying that message, so the existing `tool.failed` capture path fires. `tool.execute.after` does not fire. The turn continues, and the model did not retry. The hook runs before OpenCode's permission check. `WorkflowScannerAssembly` and `yaml` load inside the plugin runtime (Bun 1.3.14). The refused call is frozen in `tests/fixtures/tool-refused-by-hook.json` for the Seam B tests. `DenialSignal` matches by wording and does not know "refused", so the guard's message must use a word it recognises and name the rule id.

**Skip, not stop (12 Nov 2026):** Kevin's direction: the guard should not interrupt the agent. The refusal message now says the call was skipped as dangerous, asks the agent not to retry it or reach the same result another way, to continue with the rest of the task, and says the user will be told. The listing of skipped calls for the user belongs to Phase 4. The guard stays opt-in and is described as experimental.
