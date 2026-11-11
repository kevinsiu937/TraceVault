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
