# 35 — The configuration a session ran under (probe first)

**What to build:** The plugin records the configuration OpenCode resolved, with every secret value removed, into each session it sees. Each session gets a Configuration view, reached from its header, that shows that configuration. No rules run yet. This ticket is Phase 3's capture tracer bullet: it cuts the new event type, the redactor, the per-session delivery, the service façade and the new view once, so ticket 36 can add the scanner to a path that already exists.

**Blocked by:** Phase 3 spec approved (`docs/spec/phase-3.md`).

**Status:** done

- [x] Probe first. Record what the plugin's `config` hook receives in OpenCode 1.18.32: whether `{env:…}` and `{file:…}` references are already substituted, whether agents defined under `.opencode/agent/` are included, whether OpenCode's built-in defaults are included, and when the hook fires relative to `session.created` and to a resumed session. The probe runs in a throwaway workspace with a planted fake key, makes no tool call, and joins the probe output-safety tests. Freeze the scrubbed payload as a fixture
- [x] A new stored meta event, `config.snapshot`, holds the redacted configuration and its digest; the event schema document describes it
- [x] Secret values are replaced in the plugin before anything is sent: `apiKey`, every value under `headers` or `environment`, and any key containing `key`, `token`, `secret`, `password`, `auth` or `credential`, ignoring case. Every string inside a secret becomes `[redacted]` and the shape is kept, so header and variable names stay visible. The probe showed that OpenCode substitutes `{env:…}` and `{file:…}` references first, so no style is recorded
- [x] Seam B: a planted fake key's bytes appear nowhere in the database file after the recorded payload is replayed
- [x] Seam B: each session receives the snapshot exactly once per OpenCode process, before its other events; a session resumed in a new process receives that process's snapshot
- [x] A snapshot that cannot be built becomes a `capture.gap` naming the configuration, never a raw configuration, and never an error inside OpenCode
- [x] Seam A: the Configuration view shows the redacted configuration, with secrets shown only as references; a session without a snapshot, including every imported session, says "No configuration recorded"
- [x] `npm run build`, `npm run typecheck` and `npm test` all pass

**Technical notes:** The redactor is a value object with a unit table, because its edge cases (nested maps, arrays, a key that only looks like a secret) are worth pinning beyond the seams. A snapshot is not a timeline row and has no correlation id. If the probe shows that references are substituted before the hook runs, the style is `unknown`, and ticket 40 must deal with that.

**Implementation notes (11 Nov 2026):**
- **Probe.** `docs/probes/scripts/config-probe.sh` runs only `opencode debug config`, with every OpenCode folder pointed into the output directory, so no real configuration is visible. Findings are in `docs/probes/phase-3-live-probes.md`. The hook runs once per process, when OpenCode loads the plugin. It includes agents from `.opencode/agent/`, has references already substituted, and holds none of OpenCode's defaults. Fixture: `tests/fixtures/config-hook.json`.
- **Plugin.** The config hook hands the configuration to a session preamble, which redacts it and sends it into each session before that session's first payload. It is marked sent only once it got through, so a failed send is retried and a later failure does not send it twice. Sending moved out of the plugin class into its own collaborator, which takes the plugin from 290 to 263 lines.
- **Store and service.** `config.snapshot` is a meta event. It is not a timeline row, not counted on the session list, and not pushed live. The service returns the latest snapshot of a session.
- **View.** `/sessions/<id>/config` shows the redacted configuration and its digest, linked from the session header, or "No configuration recorded".
- **Deletion checks.** Each of these fails the suite: dropping the secret maps, not inheriting a secret key into nested values, a case-sensitive key match, redacting empty strings, never marking a session as sent, marking it sent before or after the wrong forward, making the snapshot a timeline row, counting it on the session list, showing the first snapshot instead of the latest, and dropping the header link. A guard against pushing it live was deleted because the live stream already drops events that are not rows.
- **Live check.** A real OpenCode 1.18.32 session, isolated from every real configuration and pointed at a model address that does not exist, so no model replied and no tool ran, went through TraceVault built from this change. The session's Configuration view showed the planted API key and MCP token as `[redacted]`, kept the `GITHUB_TOKEN` name, and showed no snapshot row on the timeline. The database file held no byte of either planted secret.
