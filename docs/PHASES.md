# Phase Plan

Each phase must be **demoable on its own**. A phase is done when its exit criteria are met with tests, not when the code compiles.

---

## Phase 1 — Backbone (observation) ← **current**

**Goal:** prove the pipeline end to end. Nothing is inferred, nothing is flagged, nothing is scanned.

```
opencode plugin hook → normalise → append-only store → service façade → localhost dashboard
```

**In scope**
- `TraceVaultPlugin` — hooks `tool.execute.before` / `tool.execute.after` and session lifecycle; ships each event to the local service.
- Event normaliser — hook payload → one `Event` record (schema v1, six types minus what the hook cannot see).
- `SqliteEventStore` — append-only, each row carrying the previous row's hash.
- `InvestigationService` — list sessions, get one session's ordered timeline.
- Dashboard — `/` session list, `/session/:id` timeline, `127.0.0.1` only.
- CLI — `tracevault init` (writes the plugin registration + config), `tracevault run` (starts service + dashboard).

**Out of scope:** MCP proxy · session-store backfill · any scanner · any flag · report · simulator · auth.

**Exit criteria (all must hold)**
1. Run a real OpenCode session that does `bash`, file edit and `webfetch`; **every** call appears in the store, none missing.
2. `localhost` shows that session in the list; the timeline is in execution order.
3. Two concurrent sessions stay separate — no cross-contamination.
4. Both seam suites are green: HTTP-rendered pages against a temp database, and recorded payload → stored events. No per-class test requirement (see the spec).
5. `tracevault init` is reversible: uninstall restores the agent config exactly.
6. Demo: 3 minutes, live, from a clean machine state.

**Known unknown to settle during Phase 1:** whether OpenCode's hook fires before or after the tool actually executes, and what identifiers it carries (tool-call id, session id, sequence). This determines de-duplication and ordering — measure it first, before writing the store.

---

## Phase 2 — Workflow Scanner

**Goal:** the timeline starts saying *this sequence looks wrong*, and says why.

- YAML rule files in `rules/`, six rule families: exfiltration chain, destructive action, self-modification, escalation-then-use, probing, scope drift.
- Matcher holds partial matches per session; raises a `scan.finding` event when the last condition matches.
- Every flag shown on the timeline, attached to the exact events that satisfied it.
- Each rule ships with two fixtures: one that must trigger, one that must not.

**Exit:** a scripted session triggers at least three different rules; each flag resolves to a rule id plus event ids; no false positive on a clean run.

---

## Phase 3 — Static Scanner + tool poisoning

**Goal:** risk that exists before the agent runs a single tool.

- Config inspection: excessive permissions, unscoped credentials, missing boundaries, ungoverned grants, dangerous read+egress combinations.
- MCP tool-description scan: instructions embedded in tool metadata (tool poisoning).
- Findings surfaced in a new dashboard tab, each naming its rule source (OWASP MCP Top 10 / OWASP Agentic Top 10 / CVE / least-privilege baseline).

**Exit:** a deliberately misconfigured agent config produces the expected findings; a clean config produces none; both pinned by fixtures.

---

## Phase 4 — Report Generator

**Goal:** one exported document per session.

- Sectioned by event type, findings linked to backing events, gaps rendered explicitly.
- Deterministic output; no judgement that cannot be traced to a rule.
- Export format decided in ADR 0003 (HTML first, PDF later).

**Exit:** the Phase 1 demo session exports a report a stranger can read and understand without the dashboard.

---

## Phase 5 — Simulator (Semester 2)

**Goal:** a sandbox that makes an agent misbehave on purpose, so the whole pipeline can be demonstrated without waiting for a real incident.

- Isolated environment; red-team behaviour scenarios (prompt injection, exfiltration chain, privilege abuse).
- Findings feed the next round — the report tells the simulator what to attempt next.
- **Not the data source for evaluation.** Public datasets (R-Judge, AgentDojo, InjecAgent, MCPTox) cover that; the proposal says so and the distinction must survive.

**Exit:** a full red→blue round runs unattended and the resulting report names what happened.

---

## Standing rules for every phase

- Phase N is not started while phase N-1 has an unmet exit criterion.
- Every public method lands with a test in the same folder.
- No dependency added without a one-line reason in the commit message.
- Every phase ends with a 3-minute demo anyone can run from a clean state.
