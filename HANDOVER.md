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
  - 74: a request that fails prints one line (method, path, error; no body) to the service's error output.
  - 75: the plugin keeps 4000 characters of a prompt (was 200), so a late freeze reaches `destructive-action`; the timeline row still shows 200.
  - 76: an MCP tool is split at the longest server name in the session's configuration (`google_drive_search` is server `google_drive`), else at the first underscore.
  - 77: `ServiceAssembly.open` builds the service and the dashboard (nine panes); `run`, every seam test and the measure scripts use it.
  - 78: the session page, configuration page and report each come from one `getSession` call; scale numbers rerun in `docs/probes/scale-measurements.md`.
  - 79: each CLI command is one file implementing `CliCommand` with its own flags; `index.ts` is a table.
  - 80: `InstallManifest` applies a file change keeping the earliest original and undoes it; `init`, `harden` and `uninstall` only call it. The record's format is unchanged.
  - 81: views escape through one value object, `HtmlText`; the 24 private copies are gone.
  - 82: the rule matcher holds matches waiting at the same step with the same bindings once, so a scan grows with the session, not its square (cold 50,000-event view 1.4 s, was 115 s); the ticket 78 slowdown was the version-2 rules.
  - 83: the session timeline shows one page of 500 rows (newest by default, `?page=`, `?event=` opens its page); findings, file rail, header counts and the report still cover the whole session.
  - 84: `allowed_by` (escalation-then-use, now version 2) judges a chained command part by part, as OpenCode does: each part's source text, `cd` skipped, every part covered. `EffectivePermissions` needed no change.
  - 85: `tracevault trust <server>` accepts a server's latest tool list (table `mcp_trust`, migration 3, rows only added); sessions recorded later compare with it, earlier ones keep their finding; acceptances are listed on the configuration page and in the report; new rule `tracevault-tampering` (high). Not committed yet.
  - 86 and 87 (reworked to the revised spec, 17 Nov 2026): the plugin's `shell.env` hook opens a `ShellProxy` (`capture/`, `node:net` only) for each bash call on 127.0.0.1:0 and points the call's proxy variables at it; every connection on that port is the call's (no `Proxy-Authorization`). CONNECT and absolute-URL HTTP are forwarded unchanged (plain HTTP gets `Connection: close`, so a kept-alive client cannot reach a second host through the first upstream); each becomes a `net.connect` posted to `/hook` through the plugin's normal delivery, stored under capture path `proxy`. An existing proxy variable (or a port that cannot open) leaves the shell alone and records a `capture.gap` saying the call was not watched. The service-side proxy (`run`'s port + 1, `recordConnection`) is gone. Kevin's live run (17 Nov) recorded curl's and git's connections under their calls.
  - 90: `harden` (and `init`) never loosens a user's deny: each pattern it adds is raised to the strictest user rule it overrides (OpenCode lets the last match decide). It may tighten more than needed (`*.env*` deny also makes `*.pem` deny).
  - 91: an append follows the archive's anchors to the chain's real end, so archiving again after new sessions no longer fails on `chain_anchors`.
  - 93: new rule `same-call-exfiltration` (high) ties an opened `net.connect` to a later bash call with the same call id that names a sensitive file, through a `same_as` operator; it says sending was possible, not certain. `exfiltration-chain` is unchanged. Not committed yet.
  - The CLI compares real paths in its entry check, so `tracevault` reached through a symlink (npm's bin link, macOS `/tmp`) runs instead of silently doing nothing.
  - 88: `exfiltration-chain` (now version 3) counts a `net.connect` that opened as egress, whatever the command looked like; the report lists "Hosts contacted" (each host:port once, its connection count, and the call that made the first), and no section when there were none. The long-session reference was regenerated (its source fixture grew). Not committed yet.
  - 89 (built; waiting on Kevin's audit run): new rule `new-host` (low) flags a session's first `net.connect` to each host not on `rules/lists/known-hosts.yaml` (default package registries and code hosts). Two small engine additions: a `host` fact and a `not_glob` operator, and a rule key `once_per: <fact>` (one finding per value per session); documented in `docs/spec/phase-2.md`. The audit script now lists every rule, a silent one with 0; new-host counts only on a database recorded with the proxy, never on imported history. The long-session reference gained one new-host row. Not committed yet.
  - 59 (built on Kevin's go, 16 Nov 2026, in a worktree and merged): on start, `run` moves sessions that ended more than `--archive-after` days ago (90; 0 = off) to `<db>-archive-<YYYY-MM>.db`, keeping each server's first tool list and every tool list a `mcp_trust` row points to; both files verify through `chain_anchors`, the session list names each run, and `report`/`verify` take an archive as `--db`. 85's `mcp_trust` is migration 3, 59's tables are 4. The hash chain is one chain over every row, not one per session. Not committed yet.
  - 77 to 81 are the refactors from the 15 Nov architecture review, listed above. The review's sixth candidate, the second agent's seam, is a Phase 5 constraint in `docs/ROADMAP.md`.
- **Gate:** 41 test files, 805 tests. Typecheck and build are clean. The pre-commit hook runs typecheck and the full suite.
- **Phase 5 is now a second agent, and the simulator is Phase 6** (Kevin, 15 Nov 2026). Neither has started. Phases 1 to 4 are polished first.

## Waiting on Kevin's decision

1. **Ticket 89's noise in real use:** the 17 Nov audit had one proxied session (`new-host` 1 finding, example.com, correct). Rerun `node docs/probes/scripts/false-positive-audit.mjs <tracevault.db>` after a few days of real work with the plugin; drop the rule if it is noisy.
2. **Candidate tickets, proposed and not yet opened:**
   - **Chain semantics:** done as ticket 84, 16 Nov 2026.
   - **Long sessions:** opened as tickets 82 (rule scan in time that grows with the session) and 83 (timeline pages), 16 Nov 2026.
   - **No way to accept a changed MCP tool:** done as ticket 85, 16 Nov 2026 (option 2, Kevin's decision).
3. **58 (store repeats once).** Deferred because the ticket 56 numbers show storage is small. Re-measure on real data first. 59 was built on Kevin's go (16 Nov 2026).

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
