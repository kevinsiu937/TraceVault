# 39 — Dangerous combination: read secrets and send data out

**What to build:** A rule, `read-and-egress`, flags each agent that can both read a sensitive file and send data out of the machine without asking. Outbound routes are labelled: web fetch, a shell that allows `curl` or `wget`, and an enabled remote MCP server. One finding per agent lists every route it has. This is the configuration that makes Phase 2's exfiltration chain possible.

**Blocked by:** 36.

**Status:** ready-for-agent

- [ ] Sensitive reads are checked against a named list of example targets, kept beside Phase 2's `sensitive-paths` list and covering the same kinds of file
- [ ] An agent with a sensitive read and any one route allowed is flagged, and the finding lists the matched route labels and the allowed example
- [ ] Denying web fetch and restricting the shell, while sensitive reads stay at OpenCode's default (ask), produces no finding
- [ ] A remote MCP server counts as a route only while it is enabled
- [ ] Source: OWASP Agentic ASI02 Tool Misuse and Exploitation, checked against the published list
- [ ] Seam C trigger and clean fixtures
- [ ] `npm run build`, `npm run typecheck` and `npm test` all pass
