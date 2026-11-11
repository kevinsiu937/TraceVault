# 36 — Shell without asking, flagged end to end (static scanner tracer bullet)

**What to build:** The thinnest complete path through the static scanner. One YAML rule, `shell-unrestricted`, flags every agent that would run any shell command without asking. That includes the case where the configuration says nothing about the shell, because OpenCode's default allows it. The Configuration view lists the finding, naming the rule, its source, the agent and the configuration entry that decided it.

This ticket is the scanner's tracer bullet. It cuts every new piece once: the shared rule primitives, the effective-permission resolution, the static rule loader, the scanner stage and its port, the service façade, the view and Seam C for static rules. Every later rule is a YAML file and two fixtures on a path that already exists.

**Blocked by:** 35.

**Status:** done

- [x] Prefactor first: the strict YAML reading, the load error and the OpenCode wildcard pattern move out of the workflow scanner into shared rule primitives that both scanners import. The named lists and match operators move with the first static rule that uses them. Behaviour is unchanged and Seam C is green before and after. The dependency rule in `AGENTS.md` and `docs/ARCHITECTURE.md` is updated
- [x] Effective permissions resolve as OpenCode 1.18.32 does: built-in defaults, then the top-level block, then the agent's own block. The last rule whose permission and pattern match decides, and "ask" applies when none matches. A unit table pins at least these: no permission block allows `rm -rf /`; `bash: ask` asks; `bash: { "*": ask, "ls *": allow }` allows `ls -la` and asks for `rm x`; an agent block overrides the top level; `.env` reads ask by default
- [x] The static rule loader reads `rules/config/*.yaml`. An unknown key, a missing field, an unknown source kind, a published source without its id, an unknown subject or an unknown check fails loading, naming the file and the field
- [x] `shell-unrestricted` (source: OWASP Agentic ASI05 Unexpected Code Execution, checked against the published list) flags each agent that would run `rm -rf /`, `python3 -c 'print(1)'` or `sh -c id` without asking; `bash: ask`, or a short allow-list, produces no finding
- [x] A finding carries the rule id, version, rule-set digest, severity, source, subject, matched labels, explanation and the snapshot's event id. It also carries a pointer to the configuration entry that decided, or says "OpenCode default" when no entry did
- [x] Seam C for static rules iterates `rules/config/*.yaml` and fails for any rule missing a trigger or clean fixture
- [x] Seam A: the Configuration view lists the finding with its rule, the source identifier, the agent and the entry, and the session header shows the number of static findings
- [x] The static scanner imports only `schema` and the shared rule primitives; the dashboard reaches static findings only through `InvestigationServicePort`
- [x] `npm run build`, `npm run typecheck` and `npm test` all pass

**Technical notes:** "OpenCode default" matters: most users never write a `permission` block, and the finding must say that the risk comes from what they did not write. Findings are computed at read time over the session's latest snapshot.

**Implementation notes (11 Nov 2026):**
- **Effective permissions.** Rebuilt from the OpenCode 1.18.32 bundle: `fromConfig` turns a string into a rule for every pattern, `merge` concatenates, and `evaluate` takes the last rule whose permission and pattern match, else "ask". Each built-in agent (build, plan, general, explore) has its own layer between the defaults and the configuration, so a top-level setting overrides plan's own edit rule, as it does in OpenCode. In the default configuration all four may run any shell command. The hidden agents (compaction, title, summary) are left out because they are never offered tools. The folders OpenCode allows for itself are left out with a `shortcut:` note, for ticket 38.
- **Rule.** `shell-unrestricted` checks three commands only an open shell allows, and fires when any one runs without asking. An allow-list such as `python3 *` therefore fires, because it runs arbitrary code. Severity is high.
- **Findings.** Each names the agent, the example that was allowed, and the JSON pointer of the entry that decided, or "OpenCode default". The service reaches the scanner through `StaticScannerPort` via a `SessionConfiguration` collaborator, the same shape as `SessionFindings`.
- **View.** The Configuration view lists findings by severity, with the severity as text, the source with its published id, the agent, the example and the entry. The session header reads "Configuration · N findings".
- **Deletion checks.** Each of these fails the suite: taking the first matching rule instead of the last, dropping the built-in agent layer or putting it after the configuration, keeping a disabled agent, not escaping the pointer, accepting an unknown action, allowing when nothing matches, counting "ask" as allowed, dropping the event id, not checking the subject, and a wrong header count.
- **Live check.** A real OpenCode 1.18.32 session, isolated from every real configuration and pointed at a model address that does not exist, went through `tracevault run` built from this change, with a configuration that only denies web fetch. The header read "Configuration · 4 findings", one `shell-unrestricted` finding each for build, plan, general and explore, every one from "OpenCode default".
