# 37 — Missing boundaries: the agent can edit its own configuration

**What to build:** A rule, `config-self-edit`, flags each agent that could edit its own configuration or standing instructions without asking: `opencode.json`, `opencode.jsonc`, anything under `.opencode/`, `AGENTS.md`, and the user-level OpenCode config folder. This is the static twin of Phase 2's `self-modification` flag. Phase 2 shows that the agent did it, and this rule shows beforehand that it could.

**Blocked by:** 36.

**Status:** ready-for-agent

- [ ] The rule uses one named list of example configuration targets, and the finding names the example the agent may edit
- [ ] An agent with edits allowed everywhere is flagged; an agent whose edit permission asks or denies on every configuration target is not
- [ ] An agent-level block that re-allows configuration edits after a top-level deny is flagged, with a pointer to the agent's entry
- [ ] Source: CVE-2025-53773 (GitHub Copilot edited its own settings to auto-approve tools), checked against NVD
- [ ] Seam C trigger and clean fixtures
- [ ] `npm run build`, `npm run typecheck` and `npm test` all pass
