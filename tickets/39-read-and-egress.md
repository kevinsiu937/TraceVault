# 39 — Dangerous combination: read secrets and send data out

**What to build:** A rule, `read-and-egress`, flags each agent that can both read a sensitive file and send data out of the machine without asking. Outbound routes are labelled: web fetch, a shell that allows `curl` or `wget`, and an enabled remote MCP server. One finding per agent lists every route it has. This is the configuration that makes Phase 2's exfiltration chain possible.

**Blocked by:** 36.

**Status:** done

- [x] Sensitive reads are checked against example targets inside the project, covering the same kinds of file as Phase 2's `sensitive-paths` list. They are inline, because Phase 2's list holds patterns, not examples
- [x] An agent with a sensitive read and any one route allowed is flagged, and the finding lists the matched route labels and the allowed example
- [x] Denying web fetch and restricting the shell, while sensitive reads stay at OpenCode's default (ask), produces no finding
- [x] A remote MCP server counts as a route only while it is enabled
- [x] Source: OWASP Agentic ASI02 Tool Misuse and Exploitation, checked against the published list
- [x] Seam C trigger and clean fixtures
- [x] `npm run build`, `npm run typecheck` and `npm test` all pass

**Implementation notes (11 Nov 2026):**
- **Remote MCP route.** OpenCode names an MCP tool `<server>_<tool>`, with characters outside `[a-zA-Z0-9_-]` turned into `_`, and asks about it with the pattern `*` (both read from the 1.18.32 bundle). The route asks about `<server>_*`, so a deny on all of a server's tools closes it, and a deny on one tool does not. explore never has this route, because it denies every tool it is not given.
- **Recorded trigger.** The configuration from ticket 35's probe flags build: `id_rsa` is readable by default and its own `bash: allow` lets it run curl.
- **Default configuration.** All four built-in agents are flagged, through web fetch, which OpenCode allows by default.
