# 40 — Unscoped credentials: secrets in the configuration and in MCP servers

**What to build:** Two rules. `secret-in-config` flags a secret written literally in the configuration instead of as an `{env:…}` or `{file:…}` reference. `mcp-holds-credentials` flags each MCP server that receives credential-named environment variables or headers. Every agent can use every MCP tool by default, so a token handed to a server is available to all of them. Both findings show the secret only as a reference.

**Blocked by:** 36.

**Status:** ready-for-agent

- [ ] `mcp-holds-credentials` flags a local server with a credential-named environment variable and a remote server with an `Authorization` header; a server with neither is clean
- [ ] `secret-in-config` flags a literal provider key and a literal MCP header, and an `{env:…}` reference is clean. Ticket 35's probe showed that OpenCode substitutes references before the hook runs, so the snapshot cannot tell the two apart. Before building this rule, ask Kevin whether the plugin may read the raw project configuration file only to classify each secret's style. If he says no, drop this rule and keep the blind spot in the spec
- [ ] No finding, page or fixture contains a secret value. Seam A asserts that the planted fake key's bytes are absent from the Configuration view
- [ ] Source: OWASP MCP01:2025 Token Mismanagement and Secret Exposure, checked against the published list
- [ ] Seam C trigger and clean fixtures
- [ ] `npm run build`, `npm run typecheck` and `npm test` all pass
