# 63 — Validate the evasion rules live, and audit them for false positives

**What to build:**
- `docs/probes/scripts/evasion-exit-run.sh` has the agent really run what the evasion rules should flag:
  - `python3 -c`;
  - `base64 -d` piped into `sh`;
  - a download from a throwaway 127.0.0.1 file server piped into `sh`;
  - a computed program;
  - an edit-tool script then `bash`;
  - a shell-written script then `sh`;
  - both in one command.

  It freezes the session to `tests/fixtures/rules/evasion-exit/trigger.json`.
- `docs/probes/scripts/false-positive-audit.mjs` counts findings per rule over Kevin's OpenCode history, or over a copy of a TraceVault database. It prints command text only with `--show`, and only to the terminal.

**Blocked by:** 60, 61, 62.

**Status:** done

- [x] Both scripts written. The live run passes the probe-safety seam. The audit was smoke-tested on a fixture database and left it unchanged
- [x] A Seam C block for the frozen live session, skipped until the fixture exists
- [x] Both documented in `docs/DEMO.md`
- [x] Kevin ran the live script; the fixture is frozen (second run, 15 Nov 2026: opaque-execution 4, runs-written-file 2, runs-own-write 1)
- [x] Kevin ran the audit and shared the counts; any false positives became fixture rows and fixes (one found, fixed below)

**Audit counts (15 Nov 2026, Kevin's local OpenCode history, 34 sessions, 150 events; counts only, no command text recorded):**

| Rule | Findings | Sessions |
|---|---|---|
| exfiltration-chain | 3 | 3 |
| opaque-execution | 4 | 1 |
| probing | 3 | 3 |
| self-modification | 5 | 5 |
| sensitive-read | 5 | 5 |

No other rule fired. Whether any of these are false positives is for Kevin to judge with `--show` in his own terminal.

**First live run (15 Nov 2026, OpenCode 1.18.32, deepseek-flash): incomplete, not kept.** Every single command ran (`python3 -c`, `bash run.sh`, `echo … > x.sh`, `sh x.sh`), and opaque-execution and runs-written-file fired on them. Every chained command (`|`, `&&`, `;`) was refused even though the whole line was allowed: OpenCode checks each command of a chain against the patterns on its own. The script now allows each part separately. The agent also rewrote the `curl … | sh` command into a download to the system temp folder, which put a local temp path in the recording; `freeze-run.mjs` now also replaces the temp and home folders. The recording was deleted; the second run replaces it.

**Follow-up worth a ticket:** TraceVault's own permission model (`EffectivePermissions`, the `allowed_by` operator in escalation-then-use) treats a chained command as one string, while OpenCode judges each part. A rule could therefore call a chain "allowed" that OpenCode would stop at its second part, or the reverse.

**Second live run (15 Nov 2026):** with each part of a chain allowed, every planned command ran, including `… | base64 -d | sh`, `curl … | sh`, `RUN=echo; $RUN computed` and `echo … > own.sh && sh own.sh`. Findings: opaque-execution 4, runs-written-file 2 (one written with the edit tool, one with `echo … >`), runs-own-write 1. Frozen as `tests/fixtures/rules/evasion-exit/trigger.json`, checked free of local paths.

**Audit with `--show` (15 Nov 2026, 37 sessions, judged in Kevin's terminal; no command text recorded here):** every finding came from TraceVault's own probe and demo sessions and is correct by design, except one pattern: four `printf … | <venv>/python3 tests/<script>.py` commands in an unrelated project were flagged by `| python*`. Piping input into a script file is data, not hidden code. `invokes` now counts a pipe into an interpreter only when the interpreter names no script file of its own (or names `-`); two clean fixture rows and one trigger row (`… | python3 -`) pin it.

