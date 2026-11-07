# 31 — Scope drift: access outside the project

**What to build:** Two parts in one slice.

1. **Capture:** `session.start` gains the session's project folder. On import it comes from OpenCode's `session.directory` column, which is `NOT NULL` in the store schema. On the live path it comes from the plugin context's `directory` or `worktree`.
2. **Rule:** `scope-drift` binds the project folder from `session.start` in its first step, then matches any file access whose normalised path falls outside it. A relative path counts as inside.

**Blocked by:** 28.

**Status:** blocked (see Blocked by)

- [ ] Probe first: for a resumed session and a subagent, record which plugin-context field equals the session's directory, and freeze the payload
- [ ] Seam B: both capture paths store the project folder on `session.start`
- [ ] A read outside the project folder is flagged; a read inside is not
- [ ] A session with no known project folder produces no scope-drift finding
- [ ] Seam C trigger and clean fixtures, including one with Windows-style paths

**Technical notes:** The store is append-only, so `session.start` rows already stored stay without a project folder, and those sessions stay silent for this rule. Re-importing into a fresh database fills them. Do not rewrite history. The binding mechanism comes from the rule model, so no special session input is needed.
