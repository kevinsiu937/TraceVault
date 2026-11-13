# 53 — Commands whose effect cannot be read from them

**What to build:** text rules read the words of a command, so code hidden inside a command evades them. Make the evasion itself visible. A small shell parser splits a command line the way a shell does. Two new operators use it: `invokes` (one of the commands starts a listed program, such as `python* -c` or `| sh`) and `runs` (one of the commands runs a file an earlier step bound). Two new rules: `opaque-execution` (code in quotes for a shell or interpreter, text piped into one, `eval`) and `runs-written-file` (the agent wrote a file, then ran it). Tracking only: neither rule is blockable.

**Blocked by:** 44. Hardening follow-up Kevin asked for on 13 Nov 2026, before Phase 5.

**Status:** done

- [x] `ShellCommandLine` splits on `;`, `&&`, `||`, `|`, `&` and new lines, honours quotes and escapes, reads `$( … )` and backticks, skips `VAR=value` and wrappers, and keeps `2>&1` as a redirection (unit table)
- [x] `invokes` and `runs` are new condition classes registered in `WorkflowScannerAssembly`; no existing condition changed
- [x] `opaque-execution` flags `python3 -c`, `curl … | sh`, `base64 -d | bash`, `bash -lc`, `node -e`, `eval` and a shell inside `$( )`, each its own finding, and stays silent on `ls` and a refused command (Seam C trigger fixture)
- [x] It stays silent on scripts run by name, quoted text that only mentions `sh -c` or `eval`, and pipes into non-interpreters (Seam C clean fixture)
- [x] `runs-written-file` flags a write followed by `bash file`, `python3 relative/path` and `./file` after `chmod` (Seam C trigger fixture), and stays silent on a run before the write, `cat` of a written file, another script, a failed write and a read (clean fixture)
- [x] The loader rejects a malformed `invokes` list and a `runs` without a binding name, naming the file and field (Seam C)
- [x] The spec's operator table and Known Blind Spots describe both operators and their limits
- [x] Typecheck, build and the full suite pass

**Technical notes:** The list of opaque invocations is `rules/lists/opaque-execution.yaml`. The parser reads only what is written: no variable or alias expansion. See `docs/spec/phase-2.md` Known Blind Spots.
