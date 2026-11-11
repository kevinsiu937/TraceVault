# 41 — The tools the model is offered (probe first)

**What to build:** The plugin records the description and parameter schema of every tool the model is offered, including MCP tools, as `tool.definition` events in each session. It uses the same once-per-process delivery as the configuration snapshot. The Configuration view lists the tools by source: built-in, plugin or MCP server.

**Blocked by:** 35.

**Status:** ready-for-agent

- [ ] Probe first, with a local fake MCP server that TraceVault ships for tests. It speaks MCP over stdio, offers two tools, and none of its tools is ever called. Record whether the `tool.definition` hook shows MCP tools in OpenCode 1.18.32; the 1.18.32 bundle suggests it does not. If it does not, try OpenCode's own tool list endpoint through the plugin's client. If neither shows MCP tool descriptions, stop and ask Kevin before going further. Freeze the scrubbed payload, and the probe script joins the probe output-safety tests
- [ ] A new stored meta event, `tool.definition`, holds one tool's id, source, server, description and parameter schema; the event schema document describes it
- [ ] Seam B: replaying the recorded payloads stores one `tool.definition` per tool per process in each session, and a repeated definition with the same digest is not sent twice
- [ ] Seam A: the Configuration view lists the tools grouped by source, and each tool's full description opens on demand
- [ ] `npm run build`, `npm run typecheck` and `npm test` all pass

**Technical notes:** The fake MCP server is test infrastructure, not a product feature. It has no dependencies, and its descriptions are fixed text written for the test.
