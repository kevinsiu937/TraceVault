# 27 — Self-modification, flagged end to end (tracer bullet)

**What to build:** The thinnest complete path through the workflow scanner. One YAML rule, `self-modification`, flags any write, delete or rename of the agent's own configuration: `opencode.json`, `opencode.jsonc`, anything under `.opencode/`, `AGENTS.md`, and the user-level OpenCode config folder. The flag appears on that row of the timeline and in a findings list on the session page, naming the rule and linking the event.

This ticket is Phase 2's tracer bullet. It cuts every new piece once: the rule file, the loader, the scanner stage and its port, the service façade, the page, and Seam C. Every later rule is a YAML file and two fixtures on a path that already exists.

**Blocked by:** Phase 2 spec approved (`docs/spec/phase-2.md`).

**Status:** ready-for-agent once the Phase 2 spec is approved

- [ ] `rules/self-modification.yaml` loads into a typed rule; an unknown key, a missing field or an invalid pattern fails loading with the file and field named
- [ ] The `yaml` dependency is added, with the reason in ADR 0004
- [ ] An agent write to `opencode.json` shows a flag on that row naming `self-modification`; the session page lists the finding with a link to the event
- [ ] A read of `opencode.json`, or a write under `src/`, produces no flag
- [ ] A finding carries rule id, rule version, rule-set digest, severity, explanation and event ids
- [ ] Seam C exists: it iterates `rules/*.yaml`, fails for any rule missing a trigger or clean fixture, and asserts each trigger's expected findings and each clean fixture's silence
- [ ] Seam A: a temp DB with one config write and one ordinary write renders the flag on exactly the config-write row
- [ ] A flagged call inside a collapsed repeated-call run shows the flag on the run header, so a collapsed run never hides a flag
- [ ] The event facts rules match on (target, outcome, operation, path, is-a-call) come from one projection in `schema/` that the timeline builder also uses; a rule naming an unknown fact fails loading
- [ ] The scanner receives the deduplicated session, the same events the page renders, and the scanner port says so
- [ ] The scanner imports only `schema`; the dashboard reaches findings only through `InvestigationServicePort`
- [ ] `npm run build`, `npm run typecheck` and `npm test` all pass

**Technical notes:** Paths go through one path value object that normalises separators, drive letters and case before matching; the Phase 1 probes ran on Windows. The trigger fixture comes from a real run that edits `opencode.json`, scrubbed of local paths. Findings are computed at read time over the whole deduplicated session, before any filter applies.
