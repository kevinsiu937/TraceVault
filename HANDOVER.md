# Handover: TraceVault, next session

Updated 15 Nov 2026. Read this, then `AGENTS.md` (the binding contract), then `tickets/README.md`.

## What TraceVault is

A local investigation platform for OpenCode agents. It records what an agent did (Phase 1), flags risky sequences of actions (Phase 2), flags risky configuration and poisoned MCP tools (Phase 3), and exports a plain-language report per session (Phase 4).

**Positioning, decided by Kevin:** TraceVault tracks what the agent did and what it can do. It does not prevent. The one exception is the experimental `init --block` guard. It skips a dangerous file-tool call and tells the agent to carry on, and the session page and the report list what was skipped. `tracevault harden` tightens the project's own `opencode.json`, so OpenCode's own permissions do the stopping; since ticket 68, `init` does this by default.

## Where things stand

- **Phases 1 to 4 are closed.** Exit tickets 10, 33, 43 and 51.
- **Hardening before Phase 5, all committed and pushed in `6f758dc`.**
  - 44: shell reads of secret files, and `git push` as egress.
  - 53, 60 to 62: commands whose effect cannot be read from them, and files written then run. A shell parser (`ShellCommandLine`) backs the `invokes`, `runs` and `writes` operators.
  - 54: `tracevault harden [--dir] [--undo]`.
  - 55: schema migration on open. Event rows are never rewritten.
  - 56: scale measurement, in `docs/probes/scale-measurements.md`.
  - 57: rule sets are stored by digest, so a session can be viewed under the rules "then" or "now".
  - 63: a live evasion run (frozen fixture) and a false-positive audit script. One false positive was found and fixed.
  - 64: egress by parsed program (`network-programs`).
  - 66: first-use trust for MCP tools (`tool-changed`).
- **Semester 1 polish (15 Nov 2026, not committed yet):**
  - 67: the service refuses requests from other web sites (`LocalRequest`).
  - 68: `init` hardens unless given `--no-harden`, and `uninstall` undoes it.
  - 69: a session's rule scan continues where it stopped, so a new event in a long session watched live costs milliseconds, not seconds.
  - 70: without `--db`, the database is `tracevault/tracevault.db` in the state folder, not `data/` in the current folder.
  - 71: `init --port <n>` for a service that is not on 4319.
  - 72: an append is one write transaction, so two processes cannot fork the hash chain.
  - 73: `tracevault verify [--db]` checks the chain and exits 1 on a break.
  - 67 to 70 are committed in `199b4fa`, and 71 to 73 in `7854d26`.
  - 74 to 76 are open, from the 15 Nov audit; see `tickets/README.md`.
  - 77 to 81 are open refactors from the 15 Nov architecture review: tests through the real assembly (77), one read per session (78, after 77), a command per file (79), one reversible file change (80), one escaping rule (81). The review's sixth candidate, the second agent's seam, is a Phase 5 constraint in `docs/ROADMAP.md`.
- **Gate:** 37 test files, 675 tests. Typecheck and build are clean. The pre-commit hook runs typecheck and the full suite.
- **Phase 5 is now a second agent, and the simulator is Phase 6** (Kevin, 15 Nov 2026). Neither has started. Phases 1 to 4 are polished first.

## Waiting on Kevin's decision

1. **Ticket 65, local proxy.** Unblocked: the ticket 64 probe showed a plugin's `shell.env` hook reaches bash (`HTTPS_PROXY`, `HTTP_PROXY`). Only the spec and ticket exist.
2. **Candidate tickets, proposed and not yet opened:**
   - **Chain semantics.** OpenCode checks each part of `a | b && c ; d` against the permission patterns on its own; this was found in the 63 live run. `EffectivePermissions` and the `allowed_by` operator (escalation-then-use) treat the whole line as one command.
   - **Long sessions.** First open of a 50,000-event session takes 54 s, because `destructive-action`, `exfiltration-chain` and `runs-written-file` grow with the square of the event count. Fix those three rules with incremental matching. The session page renders every row, so it also needs paging.
   - **No way to accept a changed MCP tool.** `tool-changed` keeps flagging it in every later session.
3. **58 (store repeats once) and 59 (archive after 90 days).** Deferred because the ticket 56 numbers show storage is small. Re-measure on real data first. If 59 is built, it must keep each server's earliest `mcp.tools` list, because 66's baseline is that event.

## Working with Kevin

- **Language:** reply in Traditional Chinese (Taiwan usage), short and plain. He wants working artefacts and a status line, not technical detail. `/tc` restates the last reply in Traditional Chinese.
- **Commits:** commit only when he says so. Never add a `Co-Authored-By` line. Never use `--no-verify`. He pushes himself.
- **Live runs:** real-model runs are his. Give him ready-to-paste commands with `!`, then verify what he pastes. His model is `deepseek/deepseek-flash`. His DeepSeek key is configured in OpenCode; never read it.
- **Ask first** about phase scope, file structure, or what a stage records. Don't start a phase without his go.
- **Background work:** when he says "run in the background", use a background agent and report when it finishes.
- He likes the smallest complete change (ponytail style) and honest limits written down.

## Environment

- **Node 24:** `export PATH="$HOME/.local/node-v24.22.2-darwin-arm64/bin:$PATH"`.
- **Commands:** `npm run typecheck`, `npm run build`, `npx vitest run`.
- **Run:** `node dist/cli/index.js run --port 4319 --db <db>`. Port 4319 is where installed plugins post.
- **Report:** `node dist/cli/index.js report <session> --db <db> --out <file>`. Add `--rules then` for the rules at recording time.
- **Harden:** `node dist/cli/index.js harden --dir <project>`, and `--undo` to restore.
- The `ui-ux-pro-max` skill is installed at `.claude/skills/` for this machine only. `.claude/` is listed in `.git/info/exclude`, by Kevin's choice. Never commit it.

## Gotchas that cost time before

- **Exit scripts overwrite the frozen fixtures** (phase-2, phase-3, evasion). Run `git restore tests/fixtures` afterwards unless the rerun is meant to replace them.
- **No local paths in commits.** Before committing, grep the diff and new files for `/Users/`, `/private/tmp`, `/var/folders` and the username. `freeze-run.mjs` now scrubs the workspace, temp and home folders. Phase-2 freezes drop `config.snapshot` and `mcp.tools`, which carry the tester's username.
- **OpenCode checks each part of a chained command separately.** A probe that allows `a | b` as one pattern gets refused; allow each part.
- **Quote YAML values that contain `: `.** For example the recommendations' "(For the developer: …)" suffix. Unquoted, it fails to parse and every rule test fails at once.
- **Headless Chrome will not render narrower than about 500 px.** A 390 px screenshot looks clipped when it isn't.
- **Recommendation split.** Rule `recommendation` text ends with "(For the developer: …)". The report splits on that suffix and shows the plain part first.
- **Opening a database migrates it** (ticket 55). Scan a copy when the original must stay untouched; the audit script does this.

## Where to read more

- **Specs:**
  - `docs/spec/phase-1.md` to `phase-4.md`;
  - `docs/spec/scale-before-phase-5.md`;
  - `docs/spec/evasion-before-phase-5.md`.

  Each has Known Blind Spots, which are the honest limits.
- **ADRs:** `docs/adr/`. 0005 is the report format.
- **Demo:** `docs/DEMO.md`, every phase step by step with the last recorded run.
- **Probes and live evidence:** `docs/probes/`.

## First commands

```bash
git log --oneline -5
export PATH="$HOME/.local/node-v24.22.2-darwin-arm64/bin:$PATH"
npm run typecheck && npm run build && npx vitest run
```

Then ask Kevin which of the waiting decisions above to take, or whether to start Phase 5.
