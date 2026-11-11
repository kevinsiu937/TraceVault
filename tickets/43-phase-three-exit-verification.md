# 43 — Phase 3 exit verification

**What to build:** Proof that Phase 3 meets its exit criteria on a real run, then that proof frozen into the gate.

**Blocked by:** 36, 37, 38, 39, 40, 42.

**Status:** done

- [x] A scripted `opencode run` session in a deliberately misconfigured throwaway workspace raises the expected findings. Its configuration allows the shell, configuration edits, `.env` reads, repeated calls and web fetch, all for a subagent that nothing can invoke, holds a planted fake credential, and connects the local fake MCP server with poisoned descriptions. The run makes no tool call. Done with a local stand-in model, then by Kevin with a real model
- [x] The Configuration view shows every expected rule id, each with its source identifier and its entry or tool
- [x] A clean scripted run, whose configuration asks for the shell, denies web fetch and configuration edits, and uses no MCP server, shows zero static findings
- [x] Both runs are frozen, scrubbed, as Seam C fixtures (`tests/fixtures/phase-3-exit/`). The gate asserts the expected rule ids on the misconfigured run, that every finding resolves to an event inside the fixture, that the clean run is empty, and that no fixture contains the planted credential
- [x] The run script (`docs/probes/scripts/phase-3-exit-run.sh`) refuses a non-empty output directory and joins the probe output-safety tests
- [x] Live evidence is recorded here, the way tickets 10 and 33 recorded it
- [x] `npm run build`, `npm run typecheck` and `npm test` all pass

**Technical notes:** The run needs a model only so that OpenCode starts and offers its tools. Nothing leaves the machine except the model request.

**Run with a stand-in model (12 Nov 2026):** Claude ran the script in an isolated home, with `OPENCODE_CONFIG_CONTENT` adding a local model that answers "ok" and `TRACEVAULT_PROBE_MODEL=deadend/m`. The misconfigured session raised each of the seven static rules once (shell-unrestricted, config-self-edit, default-ask-removed and read-and-egress on the `risky` agent; mcp-holds-credentials on `fake`; tool-hidden-instructions and tool-invisible-text on `fake/notes_search`). The clean session raised none. Both are frozen; the gate asserts every rule on the misconfigured run, every finding's event inside the fixture, an empty clean run, no planted credential, and every rule on the rendered Configuration view.

**For Kevin:** `npm run build`, then `TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/phase-3-exit-run.sh ~/tracevault-probes/exit-3`. The script overwrites the two fixtures with the real-model run, keeping only the workspace's own configuration, so a global configuration never reaches them. Then rerun `npm test` and record the printed findings here.

**Kevin's run (12 Nov 2026, `deepseek/deepseek-flash`, `~/tracevault-probes/exit-4`):** both sessions answered "ok" with no tool call. The misconfigured session (`ses_e34670818ffeRcZdf4gQ11gJK7`) raised each of the seven static rules once: config-self-edit, default-ask-removed, mcp-holds-credentials, read-and-egress, shell-unrestricted, tool-hidden-instructions and tool-invisible-text. The clean session (`ses_e3466e332ffel0Cqbe1ey4M1Qc`) raised none. The script refroze both fixtures from this run; they hold no planted credential, no local path and only the workspace's own configuration, and the full suite (453 tests) passes on them. The clean session stored its identical snapshot twice, because two of its payloads raced; the spec's Known Blind Spots records it.
