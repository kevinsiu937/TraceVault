# 76 — An MCP server whose name has an underscore is named correctly

**What to build:** A tool name is cut at its first underscore into server and tool, so a server called `google_drive` with a tool `search` is recorded as server `google`, tool `drive_search`. Probe first: record what OpenCode names a tool of such a server. Then cut the name using the server names in the session's configuration, taking the longest that fits, and fall back to the first underscore when the configuration is unknown.

**Blocked by:** None (can start immediately). The probe is Kevin's to run.

**Status:** ready-for-agent

- [ ] The probe's recorded tool name is frozen as a fixture
- [ ] A call to a tool of `google_drive` is recorded under server `google_drive` (Seam B)
- [ ] A server without an underscore is recorded as before
- [ ] Typecheck, build and the full suite pass
