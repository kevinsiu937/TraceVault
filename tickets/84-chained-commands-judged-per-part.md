# 84 — A chained command is judged part by part, as OpenCode judges it

**What to build:** OpenCode checks each command of a line such as `a | b && c ; d` against the permission patterns on its own. The ticket 63 live run showed this: a chain whose whole line was allowed was refused, because its parts were not. TraceVault's `allowed_by` operator, used by `escalation-then-use`, tests the whole line against a pattern instead. So it can call a chain allowed when OpenCode would stop at its second part (`git status && curl …` against `git status*`), or call a chain not allowed when every part is. `allowed_by` splits the line with `ShellCommandLine`, the parser the evasion rules already use, and a line is allowed only when every part is.

Whether OpenCode splits the line exactly where `ShellCommandLine` does (`$( … )`, here-documents, `&`) is pinned against the 63 live run's recorded refusals, not guessed. A split TraceVault cannot reproduce is written as a blind spot.

**Blocked by:** None.

**Status:** done (16 Nov 2026)

**How OpenCode splits, pinned:** read from the OpenCode 1.18.32 binary's bash tool (`ShellTool.collect`) and checked against the 63 runs. It walks every tree-sitter `command` node, nested `$( … )` and pipeline parts included, and asks about each node's source text, or its redirected statement's text, trimmed: quotes and redirections kept. That is why the second run's `echo 'echo own' > own.sh` pattern let `echo 'echo own' > own.sh && sh own.sh` run, and why the first run's whole-line patterns were refused. A command whose first word is `cd`, `chdir`, `pushd` or `popd` is never asked about, and a bare `RUN=echo` is not a command node. `ShellWords` now keeps each command's source text, and `allowed_by` matches each part's text, skips the `cd` family, and needs every part covered.

**EffectivePermissions:** checked. Its only caller is `StaticScanner` with the example targets of `shell-unrestricted`, `git-push-unasked` and `read-and-egress`, each a single command (`git push`, `curl https://example.com`, …). No static rule asks it about a chain, so it is unchanged.

**Blind spots** (in `docs/spec/phase-2.md`): here-document bodies, `if`/`for`/`while`/`case`/function bodies split at their keywords, and `sudo cd`.

- [x] `git status && curl …` after an approval of `git status*` is not "allowed by" it (Seam C trigger row for the escalation case, clean row for the whole chain)
- [x] A chain whose every part an approved pattern allows is allowed (Seam C)
- [x] Every earlier `escalation-then-use` fixture row still holds
- [x] `EffectivePermissions` is checked for the same mistake; if a static rule asks it about a whole command line, it is fixed the same way, and if none does, the ticket says so
- [x] The blind-spot notes in `docs/spec/phase-2.md` say where the split can differ from OpenCode's
- [x] Typecheck, build and the full suite pass
