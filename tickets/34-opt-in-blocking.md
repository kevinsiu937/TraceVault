# 34 — Opt-in blocking: refuse before it runs

**What to build:** An install option that turns on blocking. With it on, the plugin's pre-call hook classifies the pending call, evaluates the blockable rules locally, and refuses a positive match before the tool runs. Blockable rules: self-modification, and a sensitive-read rule that uses the exfiltration chain's named path list. Scope drift is not blockable: it binds the project folder in a first step, and only one-step rules can block. A default install never blocks.

**Blocked by:** 33.

**Status:** open. The probe is done; the guard is next.

- [x] Probe first: record what OpenCode does when the pre-call hook refuses. Does the model see the reason? Does a failed-tool event fire? Does the after hook fire?
- [ ] The loader accepts `blockable: true` only on a rule with one step that does not test the outcome
- [ ] With blocking on, a write to `opencode.json` is refused, the file is unchanged, and the timeline shows the call as `denied` with the rule id and its flag
- [ ] An unprotected call passes untouched
- [ ] A broken rule set, or a guard that throws internally, lets the call through and records a `guard.failure` meta event naming the call, so an unenforced call is visible as data
- [ ] With blocking off, the pre-call hook never refuses anything
- [ ] Uninstall still restores the agent configuration byte for byte
- [ ] A refused call's `denied` event carries the rule id in its data, and the schema doc says where
- [ ] Seam B through the plugin hooks covers each case above

**Technical notes:** The plugin reaches the scanner through its port. One typed assembly module builds the scanner, and both the CLI root and the generated plugin loader call it, so a new match condition is registered once. The pre-call classification reuses `ToolClassifier`, not a copy. Decide in this ticket whether the guard's own refusals count toward the probing rule. Evaluation is local with no network call, because the service may be down. Check that the `yaml` package loads inside OpenCode's plugin runtime before building on it. The sensitive path list is the named list from ticket 28, referenced, not copied.

**Probe (10 Nov 2026):** `docs/probes/scripts/refusal-probe.sh`, run twice on OpenCode 1.18.32 with `deepseek/deepseek-flash`. The full record is in `docs/probes/phase-2-live-probes.md`. When the pre-call hook throws, the model sees the thrown message as the tool result. The tool part ends in `error` carrying that message, so the existing `tool.failed` capture path fires. `tool.execute.after` does not fire. The turn continues, and the model did not retry. The hook runs before OpenCode's permission check. `WorkflowScannerAssembly` and `yaml` load inside the plugin runtime (Bun 1.3.14). The refused call is frozen in `tests/fixtures/tool-refused-by-hook.json` for the Seam B tests. `DenialSignal` matches by wording and does not know "refused", so the guard's message must use a word it recognises and name the rule id.
