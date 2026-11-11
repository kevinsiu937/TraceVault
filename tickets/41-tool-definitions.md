# 41 — The tools a local MCP server offers, through a relay

**What to build:** The plugin routes each enabled local MCP server through a pass-through relay that records the tools the server lists. Each session receives an `mcp.tools` event per server, and the Configuration view lists every server's tools, each tool's full description opening on demand. Kevin chose this route on 11 Nov 2026, after the probe below showed that a plugin cannot see MCP tool descriptions any other way.

**Blocked by:** 35.

**Status:** done

- [x] Probe first, with a local fake MCP server that TraceVault ships for tests (`docs/probes/scripts/fake-mcp-server.mjs`). It speaks MCP over stdio, offers two tools, and refuses every call. Neither the `tool.definition` hook nor OpenCode's tool list endpoint showed its tools, so the ticket stopped and Kevin chose the relay. The probe joined the probe output-safety tests, and the built-in descriptions are frozen as `tests/fixtures/tool-definition-hook.json`
- [x] Prototype: rewriting a local server's command in the plugin's `config` hook makes OpenCode start the rewritten command, and the server still connects
- [x] The relay passes every byte between OpenCode and the server unchanged, in both directions, and writes the tools a `tools/list` answer lists to a handoff file, joining pages
- [x] The plugin records the original configuration, then rewrites every enabled local server's command to the relay; remote and disabled servers stay as they are. A missing relay runtime leaves them as they are and records a `capture.gap`
- [x] A new stored meta event, `mcp.tools`, holds a server's name, its listed tools and their digest; the event schema document describes it. It is not a timeline row and not counted
- [x] Seam B: real stdio traffic through the relay reaches the store as one `mcp.tools` event per server per session, sent again only when the list changes
- [x] Seam A: the Configuration view lists each server's tools, each full description opening on demand
- [x] `npm run build`, `npm run typecheck` and `npm test` all pass

**Technical notes:** The relay is the first slice of the MCP proxy that `docs/ARCHITECTURE.md` describes: it relays and records, nothing more. It never changes, delays or drops a message. Remote servers are a known blind spot.

**Implementation notes (11 Nov 2026):**
- **Relay.** `McpRelay` spawns the original command, writes every chunk through unchanged both ways, and reads a copy line by line. Whether a `tools/list` answer starts the list over or adds a page is decided when the answer arrives, from its own request, because OpenCode may send a fresh request before an earlier answer is back; a test caught the first version, which decided on the request. A relay that cannot write the handoff file keeps relaying. The entry `dist/cli/mcp-relay.js` forwards SIGTERM, SIGINT and SIGHUP and exits with the server.
- **Plugin.** `McpToolRelay` rewrites each enabled local server whose command is a list of strings, after the snapshot is taken, and names each handoff file after the OpenCode process and the server; a stale file with the same name is removed first. `SessionPreamble` sends a server's list into a session when the session has not seen that digest, and marks it seen only once it got through. A missing relay runtime leaves the servers alone and becomes a `capture.gap`.
- **Install.** The generated loader carries the path of the Node.js that ran `tracevault init` and the relay entry; uninstall is unchanged, because nothing outside the loader is written.
- **Deletion checks.** Each of these fails the suite: changing a byte of the server's output, never starting the list over, not joining pages, letting a failed handoff write escape (an unhandled error), losing the exit code, routing remote or disabled servers, skipping the runtime check, never routing, not resending a changed list, resending an unchanged one, giving the view no tools, and making the tool list a timeline row.
- **Live check.** See `docs/probes/phase-3-live-probes.md`.
