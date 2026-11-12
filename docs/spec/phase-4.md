# Spec: Phase 4, Report Generator

> Status: approved 12 Nov 2026. Derived from the planning session of 12 Nov 2026. Binding until superseded.
> Kevin confirmed three decisions on 12 Nov 2026: the report is one self-contained HTML file (ADR 0005); it is produced by a CLI command and by a link on the session page, with identical bytes; it covers both workflow findings and configuration findings.
> Earlier the same day Kevin decided that every finding carries a recommendation written in its rule file, and that the calls the experimental guard skipped are listed at the top of the report and of the session page.
> Phase ladder: `docs/ROADMAP.md`. Tickets: `tickets/45-*` to `tickets/51-*`. Structure rules: `AGENTS.md`, `docs/ARCHITECTURE.md`.

## Problem Statement

TraceVault shows what an agent did and what it could do, but only inside the running dashboard. A developer who wants to show a session to a teammate, a reviewer or a security team has nothing to hand over.

A finding also says what went wrong but not what to do about it. The reader has to work that out alone.

With `init --block`, the guard skips dangerous calls and tells the agent to carry on. The user only learns about a skipped call by finding it in the timeline.

## Solution

Each rule file gains a `recommendation` next to its `explanation`: one or two sentences on what to do about the finding. The dashboard shows it under each finding.

The session page lists the calls the guard skipped at the top, before the findings.

A report generator turns one session into one HTML file. A stranger can read it without the dashboard, and every statement in it traces to a stored event or a rule.

## User Stories

1. As a developer, I want to export one session as a file, so that I can hand it to someone who does not run TraceVault.
2. As a reader of a report, I want to see first which calls were skipped as dangerous, so that I know what the agent did not do and why.
3. As a reader, I want each finding to say what to do about it, so that I can act without knowing the rule.
4. As a reader, I want each finding to link to the events behind it, so that I can check the evidence myself.
5. As a reader, I want the configuration findings in the same report, so that I see what the agent could do as well as what it did.
6. As a reader, I want the events grouped by type, so that I can find every file change or every shell command quickly.
7. As a reader, I want gaps in the capture and guard failures shown explicitly, so that missing evidence is never mistaken for a clean session.
8. As a reader, I want a session with no recorded configuration to say so, so that "no configuration findings" is not read as "safe configuration".
9. As a developer, I want the report to open from disk with no network, so that I can attach it to an email or a ticket.
10. As a developer, I want the same session to give the same file every time, so that two copies can be compared.
11. As a developer, I want the CLI and the dashboard link to produce the same file, so that it does not matter which one I used.
12. As a developer, I want recommendations to live in the rule files, so that advice is as reviewable as the rule.
13. As a developer, I want a rule without a recommendation to fail to load, so that no finding ships without advice.
14. As a developer, I want to print the report to PDF from the browser, so that I can file it where HTML is not accepted.

## Implementation Decisions

**Audience (decided by Kevin, 12 Nov 2026, after the first exit run).** The report is written for a reader with no IT background. It opens with an "In short" summary. Each risk shows a plain `title` from its rule file and a plain severity word (Serious, Worth checking, Minor). Event kinds, results and times are in everyday words, with times in UTC. Configuration findings are grouped by rule, naming every agent or add-on a rule applies to, and their evidence is labelled as examples of what the settings allow. Recommendations open with a plain sentence and end with a hint for the developer in parentheses. A glossary closes the report. Kevin then asked for it shorter: each risk shows only its title, severity, who it applies to and the plain advice, and "Explain more" (an HTML `details` element, no script) holds the explanation, the developer hint, the evidence and the rule id. The full record, the technical details and the glossary are folded the same way. The layout follows the ui-ux-pro-max skill's "Minimalism & Swiss Style" guidance on a slate palette: a 720px reading column, 16px body text at line height 1.6, sequential headings, a four-row "In short" status list, one card per risk, severity shown in words as well as colour, and a visible keyboard focus ring. System fonts replace the skill's web fonts, because the report fetches nothing (ADR 0005). Empty sections are left out when "In short" already says so. Rule ids and the rule-set digest stay, in small print, so a technical reader can trace every statement.

**Recommendation and title.** `title` and `recommendation` are required, non-empty strings in every rule file, in both `rules/*.yaml` and `rules/config/*.yaml`. Both loaders reject a rule without one and name the file, as they do for any missing field (ADR 0004). `Finding` and `ConfigFinding` carry it beside `explanation`. `FindingsPanelView` and `ConfigurationView` show it under the explanation. The rule version does not change, because what the rule matches does not change.

**Skipped calls.** A skipped call is a stored event whose data carries `blocked_by`. The guard and capture already write it (ticket 34). No new event type and no new rule. The session page shows a "Skipped calls" list above the Findings panel only when the session has at least one. Each item names the tool, the target, the rule that skipped it, that rule's recommendation, and links to the event.

**Report contents, in order.**

1. Header: session id, agent, start, end or "open", event count, and the rule-set digest.
2. Skipped calls, as on the session page. Omitted when there are none.
3. Workflow findings: rule, severity, explanation, recommendation, and anchor links to each event behind it. "No workflow findings" when there are none.
4. Configuration findings: rule, severity, source with its identifier, subject, configuration entry, recommendation. "No configuration recorded" when the session has no snapshot. This is different from "No configuration findings".
5. Events grouped by type, in the order of the timeline within each group. Each event has an `id` anchor and shows time, target, outcome and the rules that flagged it.
6. Gaps and guard failures, each with its reason and time window. "No gaps recorded" when there are none.

**Placement.** A `ReportView` in `src/dashboard/` renders the report from `InvestigationServicePort` alone. It imports neither `store/` nor `capture/`. No new stage and no new port. The route `GET /sessions/:id/report` returns it with `Content-Disposition: attachment`. `src/cli/ReportCommand.ts` writes the same bytes to a file. The composition root builds both from one `ReportView`.

**CLI.** `tracevault report <session-id> [--db <path>] --out <file>`. It refuses to overwrite an existing file and exits non-zero for an unknown session. It does not start the service.

**Determinism.** No generation time, no random ids, no ordering that depends on a map's insertion order beyond the timeline's own. The report states the rule-set digest instead of a date.

**Recommendation text.** Each recommendation says what to change or check, in plain words, without promising safety. For example, `sensitive-read`: "Check whether the agent needed this file. Move secrets out of the project, or set `read` for this path to `ask` or `deny`." Kevin reviews the wording of all sixteen in ticket 45.

## Testing Decisions

**No new seam.** The report is a rendered page, so it is tested at Seam A, and the CLI is tested against the route's bytes.

- **Seam A** renders against a temporary database:
  - The session page shows "Skipped calls" with the rule and recommendation when the session has a denied event with `blocked_by`, and shows no such list otherwise.
  - `GET /sessions/:id/report` returns the report: every section, anchors that resolve to events in the file, and the "No configuration recorded" and "No gaps recorded" states.
  - The report contains no `<script>` element and no `http:`, `https:` or `//` URL in an attribute.
  - Rendering twice gives identical bytes.
  - `tracevault report` writes the same bytes as the route, refuses an existing output file, and fails for an unknown session.
- **Seam C**: the existing loops over `rules/*.yaml` and `rules/config/*.yaml` also assert each finding carries a non-empty recommendation. One test loads a rule without a recommendation and expects a load error naming the file.

**Fixtures.** The frozen Phase 2 exit trigger session (workflow findings) and the Phase 3 misconfigured session (configuration findings). The skipped-call case reuses `tests/fixtures/tool-refused-by-hook.json`.

## Out of Scope

- PDF, Markdown, JSON or any other export format (ADR 0005).
- A report across several sessions, or a project-wide report.
- Redacting command text or paths in the report.
- Scheduling, emailing or uploading reports.
- Editing recommendations from the dashboard, and per-user recommendations.
- Recommendations that change with the event (templated advice). The text is fixed per rule.
- Storing findings or reports in the database.
- New rules, and changes to what existing rules match.
- Making the guard default, or guarding shell commands.
- The simulator (Phase 5), auth, accounts, theming.

## Known Blind Spots

- A report holds the stored command text and paths as written, so sharing it can share sensitive paths or arguments.
- A recommendation is general advice per rule. It cannot know whether the agent needed the file or the command in this session.
- A report reflects the rule files at the time it is rendered. Rendering the same session after a rule edit can give a different report; the rule-set digest shows this.
- The header names the rule-set digest only when at least one rule matched, because the digest is read from a finding. A report of a session no rule matched does not say which rules judged it.
- The skipped-calls list depends on the guard. Without `init --block`, nothing is skipped and the list is absent.

## Further Notes

- Sessions imported from OpenCode's history can be exported. They have no configuration, so the report says "No configuration recorded".
- The exit criterion is the Phase 1 demo session from `docs/DEMO.md`, run live and exported. Kevin runs it and judges whether a stranger can follow it.
