# 76 — An MCP server whose name has an underscore is named correctly

**What to build:** A tool name is cut at its first underscore into server and tool, so a server called `google_drive` with a tool `search` is recorded as server `google`, tool `drive_search`. Probe first: record what OpenCode names a tool of such a server. Then cut the name using the server names in the session's configuration, taking the longest that fits, and fall back to the first underscore when the configuration is unknown.

**Blocked by:** None (can start immediately). The probe is Kevin's to run.

**Related:** the fix belongs in the tool classifier, which is OpenCode-specific. Phase 5 moves that knowledge behind an adapter (`docs/ROADMAP.md`); keep this change small so it moves with it.

**Status:** done

**Probe result (16 Nov 2026, OpenCode, deepseek-flash):** OpenCode names the tools `google_drive_search` and `google_drive_list_files`: server name, underscore, tool name, with nothing marking where the server name ends. A failed MCP call never reaches `tool.execute.after`, so the probe logs `tool.execute.before` and the failed tool part instead. Frozen as `tests/fixtures/mcp-underscore-probe.json`.

**Probe:** `docs/probes/scripts/mcp-underscore-probe.sh` runs a fake MCP server named `google_drive` with tools `search` and `list_files`, and logs the tool names OpenCode hands the plugin. Run:
`TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/mcp-underscore-probe.sh /tmp/tv-mcp-underscore`

- [x] The probe's recorded tool name is frozen as a fixture
- [x] A call to a tool of `google_drive` is recorded under server `google_drive` (Seam B)
- [x] A server without an underscore is recorded as before
- [x] Typecheck, build and the full suite pass

**Done (16 Nov 2026):** the service hands capture a lookup of the MCP server names in the session's latest configuration snapshot; the classifier asks for it only for a name with an underscore and takes the longest server that prefixes the name, else the first underscore. A store failure during that lookup is a 500, not a rejected payload. History import and the guard pass no names, so they cut at the first underscore as before.
