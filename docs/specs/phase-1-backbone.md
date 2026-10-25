# Spec — Phase 1: Backbone (observation)

> Status: published to the issue tracker as `ready-for-agent`.
> Derived from the planning session of 25 Oct 2026. Binding until superseded.
> Phase ladder: `docs/PHASES.md`. Structure rules: `docs/FILE-STRUCTURE.md`, `AGENTS.md`.

## Problem Statement

I use OpenCode to write code on my own machine. It runs shell commands, edits files and fetches the web on my behalf. When a session ends, the only record of what it did is the chat transcript, which is prose: it tells me what the agent *said* it did, not the ordered list of actions it actually took.

So when something looks wrong — a file I did not expect to change, a command I did not intend, a session that behaved differently from yesterday — I have no way to inspect it. I cannot answer "what did it touch, in what order" without re-reading a long conversation and guessing.

I need the raw activity, in order, for a specific session, on a page I can open locally. Nothing more yet.

## Solution

A local service that OpenCode reports its tool activity to, a store that keeps every event in order and cannot be silently rewritten, and a page on localhost that lists sessions and shows one session's timeline.

The agent is instrumented through its own plugin hook, so the built-in tools are captured, not only calls to external tool servers. The service binds to loopback only. Nothing leaves the machine.

Phase 1 ends when a real OpenCode session that runs a shell command, edits a file and fetches a URL shows up on the page, in order, with nothing missing.

## User Stories

1. As a developer using OpenCode, I want every tool call the agent makes to be recorded, so that the record does not depend on the agent's own narration.
2. As a developer, I want built-in shell commands recorded, so that destructive actions are visible.
3. As a developer, I want file edits recorded, so that I can see which files a session touched.
4. As a developer, I want web fetches recorded, so that outbound access is visible.
5. As a developer, I want calls to external tool servers (MCP) recorded, so that one session's full surface appears in one place.
6. As a developer, I want each event timestamped, so that ordering reflects reality rather than insertion convenience.
7. As a developer, I want the agent's own session identity preserved, so that events from two concurrent sessions never mix.
8. As a developer, I want to see a list of sessions with a start time, an end time when known, and an event count, so that I can pick the run I care about.
9. As a developer, I want the most recent session at the top of the list, so that the common case takes one click.
10. As a developer, I want to click a session and see its events in execution order, so that I can follow what happened step by step.
11. As a developer, I want each timeline row to show the event type, the target (command, file path, URL, tool name), the outcome and the time, so that I do not need to open anything else.
12. As a developer, I want a failed tool call to look different from a successful one, so that errors are not silently normal.
13. As a developer, I want a session with no end recorded to be marked as open, so that a crashed or still-running session is not mistaken for a complete one.
14. As a developer, I want to know when capture was not running, so that an empty stretch of timeline is not mistaken for an idle agent.
15. As a developer, I want the store to be append-only, so that a later edit to the record is detectable rather than silent.
16. As a developer, I want to install the instrumentation with one command, so that setup does not become a project of its own.
17. As a developer, I want uninstalling to restore my agent configuration exactly, so that trying the tool is not a commitment.
18. As a developer, I want the service reachable only from this machine, so that my agent activity is not exposed to the network.
19. As a developer, I want the page to work with no build step and no external assets, so that it loads instantly and offline.
20. As a developer, I want to see the timeline for a session that is still running, so that I do not have to wait for the agent to finish.
21. As a developer, I want to distinguish a tool that returned an error from one that was denied by configuration, so that I know whether to change my config or my prompt.
22. As a developer, I want the same session to be resumable without splitting into two sessions, so that a long task that paused overnight reads as one story.
23. As a developer, I want to see which agent produced a session, so that a future second agent does not corrupt my expectations.
24. As a developer, I want events to carry the arguments' shape rather than dumping arbitrary payloads, so that the record is useful without becoming a data leak.
25. As a developer, I want the dashboard's data to come through one service interface, so that changing the page never risks changing storage behaviour.
26. As a developer, I want a failing test to block a commit, so that a proven behaviour cannot regress unnoticed.
27. As a developer, I want the whole thing to run from a clean clone with two commands, so that a demo is never a setup exercise.
28. As an examiner viewing a demo, I want to watch a session happen and then see it on the page, so that the claim "it captures every action" is demonstrated rather than asserted.

## Implementation Decisions

**Stages and boundaries.** Six components, each behind an interface: capture, schema, store, service, dashboard, plugin. The dashboard may only talk to the service interface; the service only to the store interface. Concrete implementations are chosen in one composition root. No barrel files.

**Capture.** A single capture path in Phase 1: the agent's plugin hook, which fires around every tool execution and therefore sees built-in shell, edit and fetch tools as well as MCP calls. The same hook surfaces session lifecycle events, used for session boundaries.

**Normalisation.** One envelope for every event, with a type, session identity, agent identity, capture path, timestamp, an optional agent sequence number, an optional correlation id, the type-specific payload, and a slot for unparsed agent fields so nothing is lost on a schema gap. Six activity types — skill call, API key call, document access, MCP call, hook/script, admin grant — plus meta types for session start/end, capture gap, duplicate observation and scanner finding (the last unused in Phase 1).

**Secret handling.** Credential events carry an identifier for the key, never its value. Payloads are stored as shape and digest by default, not as verbatim argument text.

**Store.** SQLite, append-only. Each stored row carries the hash of the previous row over a canonical serialisation of the event, so a later modification or deletion is detectable. Reads are by session, and by session ordered by timestamp then sequence.

**Service façade.** Two read operations for Phase 1: list sessions (identity, start, end, event count, agent), and fetch a session's timeline (ordered events, with explicit gap markers where capture was absent).

**Dashboard.** Server-rendered pages, no client build step, no external assets. Two routes: the session list, and one session's timeline. Bound to `127.0.0.1`.

**CLI.** Two commands: install (registers the plugin and its local endpoint with the agent, reversibly) and run (starts the service and dashboard). Installation must record exactly what it wrote so removal is exact.

**Ordering and de-duplication.** Ordering is timestamp, then the agent's sequence number where available, then capture path. Two paths observing the same action must be recorded as a duplicate observation and collapsed once at read time, not silently merged at write time.

**Reversibility.** Install writes to the agent's configuration; uninstall restores the pre-install state byte for byte. This is an exit criterion, not a nicety.

**Out-of-Phase-1 by construction.** No MCP proxy, no import of historical session stores, no scanners, no flags, no report, no simulator, no authentication.

## Testing Decisions

**Two seams, and nothing below them.**

- **Seam A — HTTP request to rendered page,** wired to the real store against a temporary database. This is the highest seam available: it exercises the route, the service façade, the store and the timeline assembly in one assertion. If a page shows what it should, the whole chain below is behaving.
- **Seam B — raw hook payload in, stored events out.** A recorded payload goes through the normaliser and the store; the assertion is on what the store then returns and on the ordering. This is the only place capture correctness can be pinned, because the live hook cannot be made deterministic in a unit test.

**What makes a good test here.** Assert observable behaviour: the page contains this session's rows in this order; the store returns these events with these types in this sequence. Do not assert on private helpers, internal call counts, or the shape of intermediate objects. A test that still passes after the implementation is rewritten is a good test; a test that breaks on any refactor is testing implementation, not behaviour.

**Prior art.** None — the repository has no test suite yet, only the toolchain and a pre-commit gate. The first seam test establishes the pattern both later phases copy.

**Regression lock, not ritual.** A test is added when a unit's behaviour is proven, and its job is to prevent a later change from silently breaking that behaviour. The pre-commit hook runs typecheck and the suite; a failing test cannot reach a commit.

**Fixtures.** Recorded OpenCode hook payloads live as fixtures, captured once from a real session and then frozen. A test that requires a live agent run is integration, marked separately, and not part of the pre-commit gate.

**Known unknown to settle first.** Whether the hook fires before or after execution, and which identifiers it carries, must be measured before the store is written. Ordering and de-duplication both depend on it.

## Out of Scope

- The MCP proxy and protocol-level interception.
- Importing historical sessions from the agent's own storage.
- Authentication, multi-user support, remote access, any binding other than loopback.
- All scanners: static configuration analysis and workflow sequence rules, plus tool-poisoning detection.
- Risk flags on the timeline; the finding event type exists but nothing emits it.
- Report generation in any format.
- The simulator.
- Any interface work beyond the two pages described.
- Performance tuning beyond "a session of a few thousand events renders without a visible stall".

## Further Notes

- The event schema is drafted but not yet approved; the two open questions that matter for this phase are path storage (absolute versus relative) and payload depth (verbatim versus digest). Both are decided above in favour of forensics-safe defaults: absolute in the store and relative in the UI, digest plus shape for payloads.
- The proposal's three capture paths remain the design; Phase 1 implements the one with the highest coverage per unit of work. The other two are additive because they all emit the same envelope.
- A six-line note in `AGENTS.md` and `docs/FILE-STRUCTURE.md` currently says every public method gets a test. That is superseded by the two-seam decision above and will be corrected; the seam decision is authoritative.
