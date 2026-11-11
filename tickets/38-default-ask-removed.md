# 38 — Ungoverned grants: a default question answered in advance

**What to build:** A rule, `default-ask-removed`, flags a configuration that answers "allow" in advance to a question OpenCode asks by default. There are three such questions, one label each: reading a `.env` file, touching a folder outside the project, and repeating the same call (`doom_loop`). The finding names which safeguard was switched off and where.

**Blocked by:** 36.

**Status:** ready-for-agent

- [ ] Each of the three labels fires on its own trigger fixture, and the finding points at the entry that turned "ask" into "allow"
- [ ] A configuration that leaves all three at OpenCode's default produces no finding, and neither does one that turns them to "deny"
- [ ] A temporary-folder allowance that OpenCode itself adds is not reported as a removed question
- [ ] Source: least-privilege baseline. The `.env` label also cites OWASP MCP01:2025, checked against the published list
- [ ] Seam C trigger and clean fixtures
- [ ] `npm run build`, `npm run typecheck` and `npm test` all pass
