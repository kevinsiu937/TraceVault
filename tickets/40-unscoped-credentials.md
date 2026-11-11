# 40 — Unscoped credentials: MCP servers that hold credentials

**What to build:** `mcp-holds-credentials` flags each enabled MCP server that receives credential-named environment variables or headers. Every agent can use every MCP tool by default, so a token handed to a server is available to all of them. The finding names the credential, never its value.

**Blocked by:** 36.

**Status:** done

- [x] `mcp-holds-credentials` flags a local server with a credential-named environment variable and a remote server with an `Authorization` header; a server with neither is clean
- [x] `secret-in-config` is dropped. Ticket 35's probe showed that OpenCode substitutes references before the hook runs, so the snapshot cannot tell a literal secret from a reference. Asked on 11 Nov 2026, Kevin chose not to read configuration files to find out, so the gap is in the spec's Known Blind Spots
- [x] No finding, page or fixture contains a secret value. Seam A asserts that the planted fake key's bytes are absent from the Configuration view
- [x] Source: OWASP MCP01:2025 Token Mismanagement and Secret Exposure, checked against the published list
- [x] Seam C trigger and clean fixtures
- [x] `npm run build`, `npm run typecheck` and `npm test` all pass

**Implementation notes (11 Nov 2026):**
- **Subject.** Adds `mcp-server` as a rule subject, with one fact, `secret_keys`: the names under a server's `environment` and `headers`. Values are redacted before they are stored, so only names can be matched. The rule's regex decides which names are credentials.
- **Disabled servers.** A server with `enabled: false` is not a subject, because it never starts. The clean fixture holds a disabled server with a GitHub token to show it.
- **Live check.** A real OpenCode 1.18.32 session with an enabled remote server at an address that does not answer, and a planted `Authorization` header, raised this finding with the header's name and pointer. No byte of the planted value reached the database.
