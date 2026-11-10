# 31 — Scope drift: access outside the project

**What to build:** Two parts in one slice.

1. **Capture:** `session.start` gains the session's project folder. On import it comes from OpenCode's `session.directory` column, which is `NOT NULL` in the store schema. On the live path it comes from the plugin context's `directory` or `worktree`.
2. **Rule:** `scope-drift` binds the project folder from `session.start` in its first step, then matches any file access whose normalised path falls outside it. A relative path counts as inside.

**Blocked by:** 28.

**Status:** done, except the subagent and resume halves of the probe (see the first box)

- [ ] Probe first: for a resumed session and a subagent, record which plugin-context field equals the session's directory, and freeze the payload. **Partly done:** a new root session was probed and frozen (`tests/fixtures/event-session-created.json`). `session.created` carries `info.directory`, while the plugin context's `worktree` is `/` outside git. Subagent and resume runs need a tool-using agent run, which Claude Code's safety check refused; see `docs/probes/phase-2-live-probes.md`
- [x] Seam B: both capture paths store the project folder on `session.start`
- [x] A read outside the project folder is flagged; a read inside is not
- [x] A session with no known project folder produces no scope-drift finding
- [x] Seam C trigger and clean fixtures, including one with Windows-style paths

**Technical notes:** The store is append-only, so `session.start` rows already stored stay without a project folder, and those sessions stay silent for this rule. Re-importing into a fresh database fills them. Do not rewrite history. The binding mechanism comes from the rule model, so no special session input is needed.

**Implementation notes (7 Nov 2026):**
- **Capture.** `session.start` data gains `project_dir`.
  - Live: the plugin forwards `info.directory` from `session.created`.
  - Import: `OpenCodeStoreSource` reads `session.directory`.
  - Rows stored before this change have no folder, so this rule stays silent for them.
- **Rule model.** A step may `bind: { fact: name }` to remember a fact. New fact `project`. New operator `outside: name`.
  - `outside` matches an absolute path that is neither the bound folder nor anything under it.
  - A relative path counts as inside.
  - Paths are normalised for separators and case.
  - A missing fact stays unbound, so a condition that needs it never matches.
- **Window.** `window: session` means no time limit. `destructive-action` now uses it too, since a freeze applies to the whole session.
- **Deletion checks.** Each of these fails the suite: a sibling folder treated as inside, a relative path treated as outside, case mattering, and the plugin dropping the folder. A duplicate null guard in `RuleStep` was deleted, because the `outside` condition already handles an unbound folder.

**Review fix (10 Nov 2026, `..` paths):** `NormalisedPath` did not resolve `.` or `..`, so `/home/dev/demo/../x` counted as inside the project, and a relative `../secrets/token.txt` always counted as inside. Now every path is resolved before any rule compares it, and a relative path is resolved against the project folder. Path globs gain the same resolution, so a write to `.opencode/../src/app.ts` is no longer self-modification. The scope-drift trigger adds an absolute and a relative path that climb out, plus one with `.` and `..` that stays inside. The Windows clean fixture adds two `..` paths that stay inside, and the self-modification clean fixture adds the write through `.opencode/`. A unit test pins the value object's edge cases, such as a `..` above the root, which no rule can observe yet. Removing resolution, skipping `.`, treating relative paths as inside, or mishandling `..` above a root or at the start of a relative path each fails the suite.
