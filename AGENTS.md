# TraceVault — agent working agreement

Read this before touching code. It is the contract for every AI agent working in this repo (OpenCode included).

## 0. The two non-negotiables

**OOD and TDD are not style preferences here. They are the definition of done.**

- **OOD:** code is organised as objects with one responsibility each, talking to each other through interfaces. If adding a feature means editing five unrelated files, the design is wrong — stop and fix the design before adding the feature.
- **TDD:** no behaviour exists without a test that would fail if that behaviour broke. A ticket is not finished when the code runs; it is finished when the test proves it and the suite is green.

A change that works but violates either one is rejected, not merged with a note to clean up later. There is no later.

## 1. What we are building now

**Phase 1 is the backbone, nothing more:**

```
OpenCode plugin hook → event store → localhost page (session list → session timeline)
```

Six things and only six: capture, normalise, store, list sessions, show a timeline, serve it on `127.0.0.1`.

**Explicitly out of Phase 1:** MCP proxy, session-store backfill, scanners, risk flags, reports, simulator, auth, user accounts, theming. Building any of them now is a scope violation.

## 2. OOD — the design rules

### Object design

1. **One class per file, one responsibility per class.** Filename matches class name. No `utils.ts`, no `helpers.ts`, no grab bags.
2. **A class hides its decisions.** The store does not know what HTTP is; the dashboard does not know what SQL is; the parser does not know what the UI looks like. If a class would need editing because another class changed, they are coupled and the boundary is wrong.
3. **Small enough to hold in your head.** Past ~200 lines, a class is doing two jobs. Split by responsibility, not by line count.
4. **No static state, no singletons, no module-level mutable state.** Everything a class needs arrives through its constructor — that is what makes it testable in isolation and replaceable without archaeology.
5. **Open for extension, closed for modification.** A new event type or a new scanner rule adds a file; it does not edit a growing `switch`. If every feature edits the same file, the design has failed.
6. **Program to an interface; own the abstraction.** Each stage publishes a port and consumes the port of the stage it needs — never the implementation.
7. **Composition over inheritance.** No hierarchy deeper than one level; share behaviour by delegating to a collaborator.
8. **Value objects over loose primitives.** An event id, a session id, a timestamp is a type with rules, not a bare `string`. If it can be constructed invalid, it will be.

### Boundaries between stages

1. **Every stage boundary is an interface file:** `CapturePort`, `EventStorePort`, `InvestigationServicePort`. Nothing imports a concrete class across a boundary.
2. **The composition root is the only place that chooses implementations** — `src/cli/`. One file shows how the system is assembled.
3. **Dependency direction is one-way:** `cli → dashboard → service → store`, and `cli → plugin → capture → schema`. An upward import is a bug, not a preference.
4. **"Modify the display, touch only the display."** The dashboard never imports `store/` or `capture/`. If a UI change seems to need a storage change, the façade is wrong — fix the façade, not the UI's imports.
5. **No barrel files.** They hide the dependency graph and make "which file do I change?" unanswerable — the exact problem this design exists to prevent.
6. **Folders appear when a file needs them.** No placeholder directories for later phases.

## 3. TDD — the test rules

### The cycle

1. **Write the failing test first** whenever the behaviour is expressible before the code: name the test after the observable behaviour, run it, watch it fail for the right reason.
2. **Write the smallest implementation that passes.** No speculative generality, no "while I'm here" features.
3. **Then lock it.** The test stays as the regression lock: from that moment any change that breaks the behaviour breaks the build, not the user's trust.
4. Only then refactor. Refactoring without a green suite is rewriting.

If a behaviour genuinely cannot be tested first — an unknown third-party hook shape, a physical measurement — probe it first, record what it returned, then write the test against the recorded fixture, and say in the report that this is what happened.

### The two seams

Tests attach at exactly two points, and nothing below them:

- **Seam A — HTTP request to rendered page**, wired to the real store against a temporary database. Exercises route, façade, store and timeline assembly in one assertion: if the page shows the right rows in the right order, the whole chain is behaving.
- **Seam B — raw hook payload in, stored events out.** The only place capture correctness and ordering can be pinned, because the live hook cannot be made deterministic.

These supersede per-class tests. Do **not** also write a test per class — that is duplication with extra maintenance. A unit test for a pure value object is allowed only when the object has rules worth pinning beyond what the seams show.

### Quality of a test

- **Assert observable behaviour, never implementation.** "The timeline shows these three events in this order", not "the builder called sort twice". A test that survives a rewrite of the class is a good test; one that breaks on any refactor is testing the code, not the behaviour.
- **One behaviour per test**, named as a sentence: `it("marks a session with no end as open")`.
- **No network, no real agent, no wall-clock sleep** in the gate. Time and ids are injected, not fetched.
- **A test that cannot fail is not a test.** If deleting the implementation leaves the suite green, it proves nothing.

### The gate

- **A failing test blocks the commit.** `.githooks/pre-commit` runs typecheck plus the suite. Never bypass with `--no-verify`.
- **Every ticket ships its test.** Acceptance criteria met but no test added = not done.
- **Fixtures live in `tests/fixtures/`** — real recorded payloads, frozen once captured. Anything needing a live agent run is integration, marked separately, and stays out of the gate.

## 4. Commits

- **Never commit unless Kevin says so.** Finishing work is not permission to commit.
- Conventional commits, one logical change each.
- Never commit credentials, `.env`, `*.db`, captured sessions, or anything containing a real local path.

## 5. Working with Kevin

- Report what changed and what is next. No auto-advancing past a phase boundary.
- He does not want technical detail in conversation; he wants working artefacts and a status line.
- If a decision would change the file structure, the phase scope, or the observability of a stage, ask first.
- Keep the plan honest: if a phase is not demoable yet, say so.

## 6. Phase plan

See `docs/ROADMAP.md` for phases 2-5. Do not work on a later phase while an earlier one has unmet exit criteria.

## 7. Tickets

Phase 1 work is broken into tracer-bullet tickets in `tickets/`, one file each, numbered in dependency order; `tickets/README.md` holds the index and the dependency graph.

- **Take one ticket at a time.** Never start a ticket whose blockers are open. The frontier today is `01`.
- A ticket is a **vertical slice**: it ends with something demoable, never with "a layer finished".
- Read the ticket file before starting and tick its acceptance boxes as they are met — in the same commit as the work.
- The spec behind them is `docs/spec/phase-1.md`; if a ticket and the spec disagree, the spec wins and the ticket gets fixed.
- When a ticket is done, report in one line: what works now, what the demo shows, and the next frontier ticket. Then stop — no auto-advancing to the next ticket.

## 8. Definition of done (all four, every ticket)

- [ ] The behaviour is demoable end to end — not "the class compiles".
- [ ] A seam test proves it, and that test fails if the behaviour is removed.
- [ ] Typecheck, build and the full suite pass locally.
- [ ] No file added outside its stage, no dependency added without a stated reason, no upward import.
