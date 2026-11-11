# Phase 3 live probes

Recorded against OpenCode 1.18.32 on macOS.

## 35: what a plugin's config hook receives

**Run (11 Nov 2026):** `docs/probes/scripts/config-probe.sh`. It runs `opencode debug config` in a throwaway workspace with OpenCode's home, config, data, cache and state folders all pointed into the output directory, so no real configuration or credential is visible. There is no session, no model request and no tool call. The workspace plants fake secrets as a literal value, an `{env:…}` reference and a `{file:…}` reference, two disabled MCP servers, an agent override in `opencode.json`, and an agent defined in `.opencode/agent/`.

| Question | Observed |
|---|---|
| When does the hook run? | Once, when OpenCode loads the plugin, before any session exists. The 1.18.32 bundle calls every plugin's `config` hook right after loading the plugins, and ignores a hook that throws. Each `opencode` process is one call. |
| Are `{env:…}` and `{file:…}` references substituted? | Yes. The hook receives the real values, so the plugin must treat every secret-looking value as a real secret, and cannot tell a literal secret from a reference. |
| Are agents from `.opencode/agent/` included? | Yes, with `name`, `description`, `mode`, `permission` and `prompt`. Agents in `opencode.json` appear with an empty `options` object added. |
| Are OpenCode's built-in defaults included? | No. `permission` holds only what the configuration wrote. The defaults live in the agent construction code: `"*": allow`, `doom_loop: ask`, `external_directory` asks except for the temporary folder, and `read` asks for `*.env` and `*.env.*` except `*.env.example`. |
| What else is in it? | `plugin` and `plugin_origins` (local file URLs and paths), `mode`, `command` and `username`. |

**Decision:** the plugin redacts by key before anything is sent, keeps the shape, and sends the snapshot into each session the first time the process sees it. The static scanner applies OpenCode's defaults itself. Fixture: `tests/fixtures/config-hook.json`, the hook's argument verbatim except for local paths and the user name. The planted header value has no `Bearer ` prefix, so the fixture credential check stays strict.

**Not observed:** a live session receiving the snapshot through TraceVault. Seam B replays the frozen argument through the real plugin, and the first OpenCode session after install shows it on the Configuration view.

## 41: what a plugin can see of the tools the model is offered

**Run (11 Nov 2026):** `docs/probes/scripts/tool-probe.sh`. One `opencode run`, isolated the same way as the ticket 35 probe, with a model address that does not answer: OpenCode creates the session and prepares its tools, then the model request fails, so no model reads anything and no tool runs. The workspace connects `docs/probes/scripts/fake-mcp-server.mjs`, which offers two tools (`echo`, and `notes_search` with a poisoned description kept for ticket 42) and refuses every call.

| Path | Observed |
|---|---|
| `tool.definition` hook | Called for the 12 built-in tools offered (bash, edit, glob, grep, invalid, question, read, skill, task, todowrite, webfetch, write), twice in the run. Its output holds `description`, `parameters` and `jsonSchema`. No MCP tool. |
| The plugin client's `tool.list` (`/experimental/tool`) | The same built-in tools. No MCP tool. |
| The plugin client's `mcp.status()` | `{"fake": {"status": "connected"}}`: the server was up. |
| Anything else | `/api/mcp` manages servers (list, add, remove, connect) without their tools, and the `mcp.tools.changed` event carries only the server name. |

**Conclusion:** a plugin in OpenCode 1.18.32 cannot see MCP tool descriptions. The bundle adds MCP tools to the model's tool set apart from the tool registry, after the `tool.definition` hook has run. Fixture: `tests/fixtures/tool-definition-hook.json`, the 12 built-in descriptions as the hook saw them. Ticket 41 stops here, as it says, until Kevin decides how to reach MCP descriptions.

**Decision and prototype (11 Nov 2026):** Kevin chose a relay for local servers. A throwaway plugin that rewrote `mcp.fake.command` in its `config` hook made OpenCode start the rewritten command (the wrapper logged OpenCode as its parent), and the server still reported "connected". The config object is not frozen. The relay is ticket 41.

**Live check of the relay (11 Nov 2026):** a real OpenCode 1.18.32 session, isolated as above, installed with `tracevault init` from the built tree, with the fake server in `opencode.json` and a local stand-in model that answers "ok" (a scratch script, not in the repo; a model address that does not answer makes OpenCode retry for minutes). The session stored `config.snapshot`, `session.start`, `prompt.user`, `mcp.tools` and `session.end`, in that order; the Configuration view listed `fake · 2 tools: echo, notes_search`; the snapshot kept the original command; `opencode.json` was unchanged; no relay or server process outlived the run. An earlier attempt hung because the relay stayed alive on its open stdin after the server exited; it now exits with the server.
