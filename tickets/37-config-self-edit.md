# 37 — Missing boundaries: the agent can edit its own configuration

**What to build:** A rule, `config-self-edit`, flags each agent that could edit its own configuration or standing instructions without asking: `opencode.json`, `opencode.jsonc`, anything under `.opencode/`, `AGENTS.md`, and the user-level OpenCode config folder. This is the static twin of Phase 2's `self-modification` flag. Phase 2 shows that the agent did it, and this rule shows beforehand that it could.

**Blocked by:** 36.

**Status:** done

- [x] The rule lists its example configuration targets inline, since no other rule shares them, and the finding names the example the agent may edit
- [x] An agent with edits allowed everywhere is flagged; an agent whose edit permission asks or denies on every configuration target is not
- [x] An agent-level block that re-allows configuration edits after a top-level deny is flagged, with a pointer to the agent's entry
- [x] Source: CVE-2025-53773 (GitHub Copilot edited its own settings to auto-approve tools), checked against the official CVE record: "GitHub Copilot and Visual Studio Remote Code Execution Vulnerability", CWE-77
- [x] Seam C trigger and clean fixtures
- [x] `npm run build`, `npm run typecheck` and `npm test` all pass

**Implementation notes (11 Nov 2026):**
- **Targets.** Paths relative to the project, the form OpenCode asks about edits in: `opencode.json`, `opencode.jsonc`, `.opencode/opencode.json`, an agent file, a plugin file and `AGENTS.md`. The user-level OpenCode folder is left out, because an edit there also passes the outside-folder question, and that gap is in the spec's Known Blind Spots.
- **Recorded trigger.** The configuration from ticket 35's probe denies edits to `opencode.json` only, so `opencode.jsonc` and `.opencode/` stay open, and four agents are flagged at `/permission/edit/*`. A separate Seam C test covers an agent block that re-allows edits after a top-level deny.
- **Default configuration.** build and general are flagged at "OpenCode default"; plan and explore deny edits themselves.
