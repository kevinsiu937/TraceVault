# Spec: Phase 2, Workflow Scanner

> Status: approved 7 Nov 2026. Derived from the planning session of 7 Nov 2026. Binding until superseded.
> Phase ladder: `docs/ROADMAP.md`. Tickets: `tickets/27-*` to `tickets/34-*`. Structure rules: `AGENTS.md`, `docs/ARCHITECTURE.md`.

## Problem Statement

TraceVault records every action an agent takes, but it only shows them. When an agent reads `.env` and twenty calls later runs `curl`, the record holds both events, and spotting the pattern is left to the reader. A long session hides it.

TraceVault also never stops anything. The agent reads or edits a private file, and the timeline shows it afterwards.

## Solution

A workflow scanner reads each session's events and checks them against hand-written YAML rules. When a rule matches, the timeline flags the exact events that satisfied it, and the flag names the rule. There is no ML and no judgement that cannot be traced back to a rule.

The last ticket adds an opt-in guard. It refuses a call before it runs when a single-step rule marked blockable matches. The default install never blocks.

## User Stories

1. As a developer, I want a sensitive read followed by an outbound request flagged, so that possible data exfiltration is not buried in a long session.
2. As a developer, I want edits to the agent's own configuration flagged, so that an agent changing its own permissions is visible.
3. As a developer, I want repeated denied calls flagged, so that an agent probing for permissions is visible.
4. As a developer, I want a deletion after I said "don't delete anything" flagged, so that ignored instructions are visible.
5. As a developer, I want access outside the project folder flagged, so that scope drift is visible.
6. As a developer, I want every flag to name its rule and link the events behind it, so that I can check the claim myself.
7. As a developer, I want flags to appear on a live session as soon as the closing event arrives, so that I do not have to reload.
8. As a developer, I want flags to stay put when I filter the timeline, so that a filter never hides the fact that a rule matched.
9. As a developer, I want rules to be plain files I can read and edit, so that the scanner is not a black box.
10. As a developer, I want a rule edit to re-evaluate old sessions, so that history is checked against the rules I have now.
11. As a developer, I want to opt in to blocking for protected paths, so that the agent cannot edit its own config even if it tries.
12. As a developer, I want a TraceVault failure to never block or break the agent, so that trying the guard carries no risk.

## Implementation Decisions

**Stage and placement.** The workflow scanner is its own stage and imports only `schema`. The service consumes it through a scanner port and hands the dashboard flags through `InvestigationServicePort`; the dashboard never sees the scanner. The plugin consumes the same port for blocking. The composition root chooses the implementation.

**Rule files.** One YAML file per rule under `rules/`. Lists that several rules share, such as sensitive paths, are named YAML lists under `rules/lists/`, referenced by name; the loader rejects an unknown name. Each file declares an id, a version, a severity, an explanation, a window (in events or seconds), and one or more steps. A step has a match condition and an optional repeat count. Steps may bind a field value that later steps must equal. A loader parses each file once into a typed rule and rejects unknown keys, missing fields and invalid patterns, naming the file and the field.

**One parser dependency.** Rules are parsed with the `yaml` package, TraceVault's first runtime dependency. It has no transitive dependencies, ships its own types, and follows YAML 1.2. The reason is recorded in ADR 0004.

**Open for extension.** A new rule is a new YAML file and touches no code. A new kind of match condition (glob, regex, equals, any-of) is a new class registered in the composition root. Nothing grows a `switch`.

**Facts, not raw fields.** Rules match on a closed set of event facts (type, target, outcome, operation, path, tool, text) produced by one projection in `schema/`, which the timeline builder also uses. The loader rejects an unknown fact, so a schema change cannot silently break a hand-edited rule.

**Matching.** The scanner walks a session's deduplicated events in timeline order. It holds partial matches and raises a finding when the last step matches inside the window. A partial match closes once. A last step marked `each` keeps the match open instead, so every later event that matches that step inside the window is its own finding: a `.env` read followed by two `curl` calls yields two findings. One event closes at most one match per rule, the oldest still open.

**Findings are computed at read time, never stored.** The store stays raw evidence. A finding carries the rule id, the rule version, a digest of the whole rule set, a severity, the explanation, and the ids of the events that satisfied it. A rule edit therefore re-evaluates every session, and the digest shows which rule set produced a finding. The `scan.finding` type in the event schema becomes a read-model shape, not a stored event.

**Scan scope.** Flags are computed over the whole session before any filter applies. A filtered view shows the flags on its visible rows and keeps the session's finding count unchanged.

**Dashboard.** A flagged row carries a flag marker naming the rule. A collapsed repeated-call run shows its members' flags on its header, so collapsing never hides a flag. Flags appear on session pages only; the session list shows no finding counts in Phase 2, so the list page does not scan every session. The session page lists the session's findings, and each one links to its events. Flags are never colour-only.

**Live flags.** When a live event closes a match, the stream pushes server-rendered rows for the flagged events and the page swaps them in. The rendering stays on the server, where Seam A can assert it.

**Capture extensions.** Two rule families need data Phase 1 does not capture.
- Scope drift needs the session's project folder. It goes on `session.start`, from OpenCode's `session.directory` column on import and from the plugin context on the live path.
- Escalation-then-use needs permission-grant events. Whether plugins see them is unknown, so it is probed first.

**Paths.** One path value object normalises separators, drive letters and case before any rule compares paths. The Phase 1 probes ran on Windows.

**Blocking (ticket 34).** A rule is blockable only when it has one step and does not test the outcome, and the loader enforces this. With blocking on, the plugin classifies the pending call, evaluates the blockable rules locally with no network call, and refuses a positive match. The refusal is stored as an ordinary `denied` event that carries the rule id. Any internal error lets the call through and is recorded as a `guard.failure` meta event naming the call. It is not a `capture.gap`: the call itself is still observed. Uninstall still restores the configuration byte for byte.

## Testing Decisions

**Three seams.** Phase 2 adds Seam C to the two Phase 1 seams.

- **Seam C: event sequence in, findings out.** A frozen sequence of stored events goes through the real rules and the real scanner. The assertion is on the findings: rule ids and event ids. A single suite iterates `rules/*.yaml`. A rule without a trigger fixture and a clean fixture fails the suite, so "every rule ships two fixtures" is enforced by the test, not by docs.
- **Seam A** gains one test for how flags render on the timeline and one live-stream case for flags arriving live.
- **Seam B** covers the capture extensions (project folder, permission grants) and blocking through the plugin hooks.

**Fixtures.** Rule fixtures live in `tests/fixtures/rules/`. Trigger fixtures come from real recorded runs where possible, scrubbed of local paths. Edge cases that a live run cannot stage, such as egress just outside the window, may be authored by hand, and the fixture says so.

**Phase exit fixture.** The ticket-33 scripted run and its clean counterpart are frozen as Seam C fixtures, so the exit criteria stay in the gate.

## Out of Scope

- The static configuration scanner and tool-poisoning detection (Phase 3).
- Reports in any format (Phase 4).
- The simulator (Phase 5).
- Storing findings, alerting, or notifications outside the dashboard.
- A rule editor in the UI.
- Blocking on multi-step rules or on outcomes. Scope drift therefore cannot block.
- Finding counts on the session list.
- ML or any scoring that a rule cannot explain.

## Known Blind Spots

- User prompts are stored truncated at 200 characters, so a freeze phrase past that limit is invisible to the destructive-action rule.
- Outbound requests made from shell commands are matched by pattern and are easy to evade. A finding names the pattern that matched and claims nothing more.
- Whether plugins receive permission events is unknown until ticket 32's probe.
- What OpenCode does when the pre-call hook refuses a call is unknown until ticket 34's probe.
