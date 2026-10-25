# Roadmap — Phases 2 to 5

Phase 1 is not described here. It lives in `tickets/` as ten tracer-bullet tickets, indexed by `tickets/README.md`.

Each later phase starts only when the previous phase's exit criteria are met.

---

## Phase 2 — Workflow Scanner

**Goal:** the timeline starts saying *this sequence looks wrong*, and says why.

- YAML rule files, six rule families: exfiltration chain, destructive action, self-modification, escalation-then-use, probing, scope drift.
- A matcher holds partial matches per session and raises a finding when the last condition matches.
- Every flag appears on the timeline attached to the exact events that satisfied it.
- Each rule ships with two fixtures: one that must trigger, one that must not.

**Exit:** a scripted session triggers at least three rules; each flag resolves to a rule id plus event ids; a clean run produces no flags.

## Phase 3 — Static Scanner and tool poisoning

**Goal:** risk that exists before the agent runs a single tool.

- Configuration inspection: excessive permissions, unscoped credentials, missing boundaries, ungoverned grants, dangerous read-and-egress combinations.
- Tool-description scan: instructions embedded in MCP tool metadata.
- Findings in their own view, each naming its rule source (OWASP MCP Top 10, OWASP Agentic Top 10, a CVE, or the least-privilege baseline).

**Exit:** a deliberately misconfigured agent produces the expected findings; a clean configuration produces none; both pinned by fixtures.

## Phase 4 — Report Generator

**Goal:** one exported document per session, readable without the dashboard.

- Sectioned by event type, findings linked to the events behind them, gaps rendered explicitly.
- Deterministic output: no judgement that cannot be traced to a rule.
- Export format settled in an ADR before implementation.

**Exit:** the Phase 1 demo session exports a report a stranger can follow.

## Phase 5 — Simulator (Semester 2)

**Goal:** a sandbox that makes an agent misbehave on purpose, so the pipeline can be demonstrated without waiting for a real incident.

- Isolated environment; red-team scenarios: prompt injection, exfiltration chain, privilege abuse.
- Findings seed the next round — the report tells the simulator what to attempt next.
- **Not the evaluation data source.** Public datasets (R-Judge, AgentDojo, InjecAgent, MCPTox) cover that; the proposal states the distinction and it must survive.

**Exit:** a full red-to-blue round runs unattended and the resulting report names what happened.

---

## Standing rules for every phase

- No phase starts while the previous one has an unmet exit criterion.
- Every phase ends with a demo anyone can run from a clean state.
- New capability means new tickets, cut the same way: vertical slices with declared blockers.
