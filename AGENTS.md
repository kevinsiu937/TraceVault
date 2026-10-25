# TraceVault — agent working agreement

Read this before touching code. It is the contract for every AI agent working in this repo (OpenCode included).

## 1. What we are building now

**Phase 1 is the backbone, nothing more:**

```
OpenCode plugin hook → event store → localhost page (session list → session timeline)
```

Six things and only six: capture, normalise, store, list sessions, show a timeline, serve it on `127.0.0.1`.

**Explicitly out of Phase 1:** MCP proxy, session-store backfill, scanners, risk flags, reports, simulator, auth, user accounts, theming. Building any of them now is a scope violation.

## 2. Architecture rules (OOD)

1. **One class per file.** A file exports exactly one class (plus the types it needs). No "utils.ts" grab bags.
2. **Every stage boundary is an interface file.**
   - `src/capture/CapturePort.ts` — how events arrive
   - `src/store/EventStorePort.ts` — how events are persisted and read
   - `src/service/InvestigationServicePort.ts` — what the UI and later the scanners are allowed to call
   Concrete classes implement these; nothing imports a concrete class across a boundary.
3. **The composition root is the only place that wires implementations.** That is `src/cli/`.
4. **Dependency direction is one-way:** `dashboard → service → store port`, `capture → store port`, `schema` is shared by all. Never upward, never sideways.
5. **"Modify the display, touch only the display."** The dashboard must never import `store/` or `capture/`. If a UI change needs a store change, the façade is wrong — fix the façade.
6. **A file you can read in one sitting.** If a class passes ~200 lines, it holds more than one responsibility; split it.

## 3. Testing rules (regression lock, two seams)

Tests exist to lock behaviour that already works, so a later change cannot silently break it.

1. **Two seams only, and nothing below them.**
   - **Seam A** — an HTTP request against a server wired to the real store on a temporary database. If the page shows the right rows in the right order, the route, façade, store and timeline assembly are all behaving.
   - **Seam B** — a raw recorded hook payload in, stored events out. The only place capture correctness and ordering can be pinned.
   These are supersets of per-class tests. Do **not** also write a test per class; that is duplication with extra maintenance.
2. **Assert behaviour, not implementation.** "The timeline lists these three events in this order", not "the builder called sort twice". A test that survives a refactor is a good test.
3. **Write the test when the behaviour works.** Red/green ceremony is optional; the lock is mandatory.
4. **A failing test blocks the commit.** `.githooks/pre-commit` runs typecheck + the suite; never bypass with `--no-verify`.
5. **Fixtures live in `tests/fixtures/`** — real recorded hook payloads, frozen once captured. A test needing a live agent run is integration, marked separately, and stays out of the pre-commit gate.

## 4. Commits

- **Never commit unless Kevin says so.** Finishing work is not permission to commit.
- Conventional commits, one logical change each.
- Never commit credentials, `.env`, `*.db`, captured sessions or anything containing a real local path.

## 5. Working with Kevin

- Report what changed and what is next. No auto-advancing past a phase boundary.
- He does not want technical detail in conversation; he wants working artefacts and a status line.
- If a decision would change the file structure, the phase scope, or the observability of a stage, ask first.
- Keep the plan honest: if a phase is not demoable yet, say so.

## 6. Phase plan

See `docs/PHASES.md`. Do not work on a later phase while an earlier one has unmet exit criteria.

## 7. Tickets

Phase 1 work is broken into tracer-bullet tickets in `tickets/`, one file each, numbered in dependency order; `tickets/README.md` holds the index and the dependency graph.

- **Take one ticket at a time.** Never start a ticket whose blockers are open. The frontier today is `01`.
- A ticket is a **vertical slice**: it ends with something demoable, never with "a layer finished".
- Read the ticket file before starting and tick its acceptance boxes as they are met — in the same commit as the work.
- The spec behind them is `docs/specs/phase-1-backbone.md`; if a ticket and the spec disagree, the spec wins and the ticket gets fixed.
- When a ticket is done, report in one line: what works now, what the demo shows, and the next frontier ticket. Then stop — no auto-advancing to the next ticket.
