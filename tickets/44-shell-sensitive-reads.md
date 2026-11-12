# 44 — Sensitive files read through the shell, and pushes

**What to build:** `sensitive-read` and the first step of `exfiltration-chain` only saw the file tools, so `cat .env` in the shell went unflagged. A new match operator, `names`, tests whether a command line names a path on a glob list, reusing `glob`. A new rule, `shell-sensitive-read`, flags every shell command that names a file on the shared `sensitive-paths` list. `exfiltration-chain` starts on either kind of read; the shell kind must have run, since a refused command read nothing. Tracking only: the new rule is not blockable.

Added the same day, also at Kevin's request: `git push` is an egress in `exfiltration-chain`, so reading a secret and then pushing is flagged. A new static rule, `rules/config/git-push-unasked.yaml`, flags an agent whose configuration lets it push without asking.

**Blocked by:** 34. Phase 2 follow-up, requested by Kevin on 12 Nov 2026.

**Status:** done

- [x] `names` is a new condition class registered in `WorkflowScannerAssembly`; no existing condition changed
- [x] `shell-sensitive-read` flags `cat`, `grep`, `curl -d @…`, `scp` and a refused `cat` of listed files, each its own finding (Seam C trigger fixture)
- [x] It stays silent on look-alikes (`.envrc`, `env.js`, `envelope`) and on a read-tool read of `.env`, which `sensitive-read` reports (Seam C clean fixture)
- [x] `exfiltration-chain` raises a shell read followed by an egress, and a refused shell read followed by egress stays clean
- [x] The finding names which read started the chain ("sensitive read" or "sensitive file named in the shell")
- [x] The spec's operator table and Known Blind Spots describe the operator and its limits
- [x] `exfiltration-chain` raises a sensitive read followed by `git add … && git commit … && git push`, and stays silent on a commit whose message mentions push
- [x] `git-push-unasked` flags agents whose configuration allows `git push`, skips an agent that asks before a push, and stays silent when only OpenCode's default allows it (Seam C config fixtures; the Phase 3 exit run also passes)
- [x] Typecheck, build and the full suite pass

**Technical notes:** The rule reads the words of a command, not what it does, so it is easy to evade and can count a command that only mentions a file. See `docs/spec/phase-2.md` Known Blind Spots.
