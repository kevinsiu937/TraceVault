# 43 — Phase 3 exit verification

**What to build:** Proof that Phase 3 meets its exit criteria on a real run, then that proof frozen into the gate.

**Blocked by:** 36, 37, 38, 39, 40, 42.

**Status:** ready-for-agent

- [ ] A scripted `opencode run` session in a deliberately misconfigured throwaway workspace raises the expected findings. Its configuration allows the shell, configuration edits, `.env` reads and web fetch, holds a planted fake credential, and connects the local fake MCP server with poisoned descriptions. The run makes no tool call
- [ ] The Configuration view shows every expected rule id, each with its source identifier and its entry or tool
- [ ] A clean scripted run, whose configuration asks for the shell, denies web fetch and configuration edits, and uses no MCP server, shows zero static findings
- [ ] Both runs are frozen, scrubbed, as Seam C fixtures. The gate asserts the expected rule ids on the misconfigured run, that every finding resolves to an event inside the fixture, that the clean run is empty, and that no fixture contains the planted credential
- [ ] The run script refuses a non-empty output directory and joins the probe output-safety tests; Kevin runs it
- [ ] Live evidence is recorded here, the way tickets 10 and 33 recorded it
- [ ] `npm run build`, `npm run typecheck` and `npm test` all pass

**Technical notes:** The run needs a model only so that OpenCode starts and offers its tools. Nothing leaves the machine except the model request.
