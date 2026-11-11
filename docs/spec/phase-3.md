# Spec: Phase 3, Static Scanner and Tool Poisoning

> Status: approved 11 Nov 2026. Derived from the planning session of 11 Nov 2026. Binding until superseded.
> Kevin confirmed four decisions on 11 Nov 2026: the plugin records the resolved configuration rather than reading files; nine tickets, one per function; shared rule primitives move to their own folder; findings appear in a per-session Configuration view.
> Phase ladder: `docs/ROADMAP.md`. Tickets: `tickets/35-*` to `tickets/43-*`. Structure rules: `AGENTS.md`, `docs/ARCHITECTURE.md`.

## Problem Statement

TraceVault judges what an agent did. It says nothing about the risk that exists before the agent runs a single tool.

That risk is already present when OpenCode starts. OpenCode 1.18.32's defaults allow almost everything: any shell command, any edit, any web fetch. It asks only before reading `.env` files, before touching folders outside the project, and when the agent repeats the same call. A configuration can remove even those questions. An MCP server can also hand the model a tool description that hides instructions, and the model reads that description whether or not it ever calls the tool.

Today a developer finds out about a permissive configuration or a poisoned tool only after something has gone wrong, if at all.

## Solution

The plugin records two things in each session: the configuration OpenCode resolved, with every secret value removed, and the description of every tool the model was offered. A static scanner checks them against hand-written YAML rules. Each rule names its source: the OWASP MCP Top 10, the OWASP Top 10 for Agentic Applications, a CVE, or the least-privilege baseline.

Findings appear in a Configuration view of the session. Each finding names the rule, its source, and the exact configuration entry or tool behind it. As in Phase 2, there is no ML, and no finding that cannot be traced back to a rule.

## User Stories

1. As a developer, I want to know when an agent can run any shell command without asking, so that I can restrict the shell before something runs.
2. As a developer, I want to know when an agent can edit its own configuration without asking, so that a prompt injection cannot quietly widen its own permissions.
3. As a developer, I want to know when a configuration removes a question OpenCode asks by default, so that I see every safeguard that was switched off.
4. As a developer, I want to know when one agent can both read secrets and send data out without asking, so that I see an exfiltration path before it is used.
5. As a developer, I want to know when a secret is written into the configuration itself, so that I can move it to an environment variable.
6. As a developer, I want to know which MCP servers receive credentials, so that I can see which third-party code holds my tokens.
7. As a developer, I want a tool description that hides instructions flagged, so that I can remove a poisoned MCP server before the model acts on it.
8. As a developer, I want invisible characters in a tool description flagged, so that text I cannot see on screen cannot steer the model.
9. As a developer, I want each finding to name its rule source, so that I can look up why it matters.
10. As a developer, I want each finding to point at the exact configuration entry or tool, so that I know what to change.
11. As a developer, I want to see the configuration a session ran under, so that I can investigate a session against the permissions it really had.
12. As a developer, I want secrets never stored, so that recording my configuration does not create a new leak.
13. As a developer, I want a resumed session to get the configuration of the process that resumed it, so that a changed configuration is not hidden behind an old snapshot.
14. As a developer, I want a session recorded before Phase 3 to say that no configuration was recorded, so that missing evidence is never mistaken for a clean configuration.
15. As a developer, I want a clean configuration to produce no findings, so that I can trust that a finding means something.
16. As a developer, I want static rules to be plain files I can read and edit, so that the scanner is not a black box.
17. As a developer, I want a rule edit to re-check old sessions, so that history is checked against the rules I have now.
18. As a developer, I want built-in OpenCode defaults taken into account, so that a configuration that says nothing about the shell is not reported as safe.

## Implementation Decisions

**Where the configuration comes from.** The plugin records the configuration OpenCode resolved. It does not read configuration files from disk. OpenCode merges several sources: the global config, the project config, `.opencode/` agent files and environment overrides. Reproducing that merge would be a second implementation that drifts. The plugin's `config` hook receives the merged result. Probed on 11 Nov 2026 (ticket 35, `docs/probes/phase-3-live-probes.md`): OpenCode calls the hook once, when it loads the plugin and before any session exists. The argument includes agents defined in `.opencode/agent/`, has every `{env:…}` and `{file:…}` reference already substituted, and does not include OpenCode's built-in defaults.

**Two new stored event types.**

- `config.snapshot`: the resolved configuration after redaction, and a digest of it.
- `tool.definition`: one tool's id, its source (built-in, plugin or MCP server), its description and its parameter schema.

Both are meta events with no correlation id, so neither is mistaken for a duplicate. Neither is a timeline row. The configuration and the tool list belong to the OpenCode process, not to a session. The plugin therefore sends both into each session the first time that process sees the session, before the session's other events. A resumed session in a new process gets that process's configuration.

**Redaction is a trust boundary.** Secret values never reach the store, so the redaction runs in the plugin, before anything is sent. A value is a secret when its key says so: `apiKey`, every value under a `headers` or `environment` map, and any key that contains `key`, `token`, `secret`, `password`, `auth` or `credential`, ignoring case. The keys under `env` count too. Every string inside a secret becomes `[redacted]`, and the shape is kept, so header and variable names stay visible. An empty string stays empty, because it holds no value. OpenCode substitutes references before the hook runs, so the plugin cannot tell a literal secret from an `{env:…}` reference and does not try. A test plants fake keys and checks that their bytes neither leave the plugin nor appear in the database file. A configuration the plugin cannot copy is recorded as a `capture.gap`, never as raw data.

**Tool descriptions.** OpenCode's `tool.definition` hook passes a tool's description before the model sees it. The OpenCode 1.18.32 bundle suggests that the hook fires for built-in and plugin tools only. It appends the MCP tool catalog after the hook has run. Ticket 41 probes this. If the hook does not show MCP tools, the next candidate is OpenCode's own tool list endpoint, reached through the plugin's client. If neither shows MCP tool descriptions, the ticket stops and asks Kevin. Connecting to MCP servers from TraceVault would run third-party code, and the MCP proxy is not part of this phase.

**Effective permissions.** Rules never read raw configuration JSON. One value object answers the question "would this agent run this call without asking?". It resolves permissions the way OpenCode 1.18.32 does: OpenCode's defaults first, then the top-level `permission` block, then the agent's own block. The last rule whose permission and pattern both match decides, and "ask" applies when none matches. Patterns match with the wildcard semantics Phase 2 already implements for permission grants. The edit and read tools map onto the `edit` and `read` permissions. The defaults are recorded from the 1.18.32 bundle:

```
"*": allow · doom_loop: ask · external_directory: { "*": ask, temp folder: allow }
read: { "*": allow, "*.env": ask, "*.env.*": ask, "*.env.example": allow }
```

A unit table pins this resolution. A new OpenCode version means checking these defaults again.

**Stage and placement.** The static scanner is its own stage in `src/scanner/static/` and imports only `schema` and the shared rule primitives. The service consumes it through a `StaticScannerPort` and hands findings to the dashboard through `InvestigationServicePort`. The dashboard never sees the scanner. The composition root chooses the implementation.

**Shared rule primitives.** Both scanners need the strict YAML reading, the load error that names a file and field, and the OpenCode wildcard pattern. Ticket 36 moved these out of `src/scanner/dynamic/` into `src/scanner/rules/`, which both scanners import, with Seam C green across the move. The named lists and the match operators move with the first static rule that uses them. The dependency rule becomes: `scanner/rules` imports only `schema`, and each scanner imports `schema` and `scanner/rules`.

**Rule files.** Static rules are one YAML file per rule under `rules/config/`, named `<id>.yaml`, with the same strict loading as Phase 2. A rule file has these keys:

| Key | Meaning |
|---|---|
| `id` | The rule id. It must equal the file name. |
| `version` | A positive whole number, reported on each finding. |
| `severity` | `low`, `medium` or `high`. |
| `explanation` | The sentence a finding shows. |
| `source` | `{ kind, id, title }`. `kind` is `owasp-mcp`, `owasp-agentic`, `cve` or `baseline`. `id` is the published identifier, such as `MCP03:2025`, `ASI05` or `CVE-2025-53773`. `baseline` has no id. |
| `subject` | What each finding is about: `agent`, `mcp-server` or `tool`. The rule runs once per subject of that kind. |
| `when` | One or more checks, all of which must hold for the subject. |

A check is one of:

- `allows: { permission, target }`. The subject agent would run a call for that permission and target without asking. A target is a concrete example, such as `rm -rf /` or `.env`, not a pattern, because the question is about a call the agent could make. A target may also be a list of examples, and the check holds when any one of them is allowed. The finding names the example that was allowed.
  `configured: true` counts only an allowance the configuration made, never one that OpenCode's defaults make.
- `remote_mcp: true`. The subject agent may call the tools of an enabled remote MCP server without asking. OpenCode names those tools `<server>_<tool>`, so the check asks about `<server>_*`.
- `match: { <fact>: { regex: <pattern> } }`. One of the subject's fact values contains a match, ignoring case. `regex` is the one operator configuration facts support so far.
- `any: [{ label, <check> }, ...]`. This holds when any alternative holds. Every alternative that holds adds its evidence, labelled.

A check suits one subject: `allows` and `remote_mcp` need `agent`, and `match` needs `mcp-server`. The loader rejects a check on the wrong subject.

Subject facts:

| Subject | Facts |
|---|---|
| `agent` | None yet. An agent is examined through `allows` and `remote_mcp`. |
| `mcp-server` | `secret_keys`: the names under the server's `environment` and `headers`, whose values are never stored. |
| `tool` | `id`, `source` (`builtin`, `plugin` or `mcp`), `server`, `description`, `parameter_text` (every description inside the parameter schema, one per line) |

The agents that exist are OpenCode's built-in agents that are offered tools (build, plan, general and explore) plus the agents in the configuration. A disabled agent is not a subject, and neither is an MCP server with `enabled: false`, which never starts.

**Findings are computed at read time, never stored.** A static finding carries the rule id, the rule version, the rule-set digest, the severity, the source, the subject and its kind, the explanation, the id of the snapshot or tool event it came from, and its evidence. Each piece of evidence is the value found (an example call the agent would make without asking, a server URL or a credential name), the label of the alternative that held, if any, and a JSON pointer to the configuration entry behind it, or "OpenCode default". A rule edit re-checks every session.

**Rule families and their first rules.** Each family is one ticket and starts with the rules listed here.

| Family | Rule | Source |
|---|---|---|
| Excessive permissions | `shell-unrestricted`: an agent can run any shell command without asking | OWASP Agentic ASI05 Unexpected Code Execution |
| Missing boundaries | `config-self-edit`: an agent can edit `opencode.json`, `.opencode/` or `AGENTS.md` without asking | CVE-2025-53773 |
| Ungoverned grants | `default-ask-removed`: the configuration answers "allow" in advance to a question OpenCode asks by default. This covers `.env` reads, folders outside the project and repeated calls, one label each | Least-privilege baseline |
| Dangerous combinations | `read-and-egress`: one agent can read a sensitive file and also send data out (web fetch, an unrestricted shell or a remote MCP server), all without asking | OWASP Agentic ASI02 Tool Misuse and Exploitation |
| Unscoped credentials | `mcp-holds-credentials`: an enabled MCP server receives credential-named environment variables or headers. A rule for a secret written literally in the configuration was dropped on 11 Nov 2026; see Known Blind Spots | OWASP MCP01:2025 Token Mismanagement & Secret Exposure |
| Tool poisoning | `tool-hidden-instructions`: a tool or parameter description contains instruction patterns aimed at the model. `tool-invisible-text`: it contains zero-width, bidirectional-control or Unicode tag characters | OWASP MCP03:2025 Tool Poisoning |

Each ticket checks its source identifiers against the published list before the rule ships.

**Dashboard.** Each session gets a Configuration view, reached from the session header, which shows the number of static findings. The view lists the findings by severity. Each finding names its rule, its source with the published identifier, its subject and the configuration entry, with secret values shown only as references. Below the findings, the view shows the redacted snapshot and the tool list. A session without a snapshot says "No configuration recorded". It does not say that nothing was found. Severity is never shown by colour alone.

## Testing Decisions

**No new seam.** The configuration and the tool list are stored events, so Phase 3 reuses the three existing seams.

- **Seam B** replays recorded `config` and `tool.definition` hook payloads through the plugin. It asserts the stored `config.snapshot` and `tool.definition` events, that secret bytes are absent from the database file, and that each session receives the snapshot exactly once per process.
- **Seam C** runs a frozen snapshot and its tool events through the real static rules and the real scanner. The assertion is on rule ids, subjects, configuration pointers and event ids. One suite iterates `rules/config/*.yaml` and fails for any rule missing a trigger or clean fixture, the same way the Phase 2 suite does.
- **Seam A** renders the Configuration view against a temporary database: the findings, the source identifiers, the redacted values and the "No configuration recorded" state.

**Unit tables** are allowed for two value objects whose rules are worth pinning beyond the seams: the effective-permission resolution against OpenCode's defaults, and the redactor.

**Fixtures.** Trigger fixtures come from recorded snapshots where possible, scrubbed of local paths. A misconfiguration that a live run cannot stage safely may be authored, and then the fixture says `"source": "authored"`. Tool-poisoning fixtures use a local fake MCP server that TraceVault ships for the test. Its descriptions are poisoned, and nothing ever calls its tools.

**Phase exit fixture.** The ticket-43 misconfigured run and its clean counterpart are frozen as Seam C fixtures, so the exit criteria stay in the gate.

## Out of Scope

- Reading configuration files from disk, or scanning a project that OpenCode has never started in.
- Connecting to MCP servers, and the MCP proxy.
- Detecting a tool whose description changed between sessions (a "rug pull"). Every finding in Phase 3 is about one session.
- Blocking or refusing anything because of a static finding.
- Static findings on the session list, and a project-wide page of configurations.
- Fixing a configuration from the dashboard.
- Rules for agents other than OpenCode.
- Reports in any format (Phase 4).
- ML or any scoring that a rule cannot explain.

## Known Blind Spots

- OpenCode's defaults and its permission resolution are recorded from version 1.18.32. A later version can change them, and the scanner will not notice until the unit table is checked again.
- Tool-poisoning rules match text patterns and are easy to evade. A finding says "possible" and names the pattern that matched.
- A session gets the configuration of the process that saw it. A configuration edited while that process runs is not seen until the next process starts.
- Redaction goes by key. A secret under an ordinary key, such as a token passed as an MCP command argument or inside a URL, is not recognised and is stored as written.
- The snapshot cannot show whether a secret was written literally or as a reference, because OpenCode substitutes references before plugins see the configuration.

- A secret written literally in the configuration is not detected. OpenCode substitutes `{env:…}` and `{file:…}` references before plugins see the configuration, so the snapshot cannot tell a literal from a reference, and Kevin chose on 11 Nov 2026 not to read configuration files to find out.
- `config-self-edit` checks paths inside the project. An edit to the user-level OpenCode folder also passes OpenCode's question about folders outside the project, and the rule does not combine the two.
- `read-and-egress` checks secret files inside the project. Files such as `~/.ssh/id_rsa` sit outside it, behind the same outside-folder question.
- Each rule checks example calls, not every possible call. `default-ask-removed` uses one folder outside the project, so an allowance for a single other folder is not reported.

## Further Notes

- Sessions imported from OpenCode's history have no snapshot, because the session store does not keep the configuration. They show "No configuration recorded".
- A configuration with no `permission` block at all inherits OpenCode's permissive defaults, so it is expected to raise findings. The clean exit configuration must therefore restrict the shell, web fetch and configuration edits explicitly.
- CVE-2025-54136 (MCPoison, Cursor) shows that trust in a project's MCP entries can be abused once they are approved. A rule for a project configuration that starts a local MCP command is a candidate for later. It is not in this phase.
