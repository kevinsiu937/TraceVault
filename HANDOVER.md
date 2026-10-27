# Handover — TraceVault, next session

Kevin has handed this repository to a fresh agent session. This file is the brief.

## Authorization (pre-granted by Kevin, do not re-ask)

- Edit any file in this repository.
- Run `npm install`, `npm run typecheck`, `npm test`, `npm run build`, and any node/vitest command.
- Start and stop local processes on loopback (the TraceVault service, Chrome headless with CDP).
- `git add` and `git commit` in this repository. **No push** (no remote is configured for it) and no force/rebase of published history.
- Read OpenCode's local store read-only: `%USERPROFILE%\.local\share\opencode\opencode.db`.
- Create and delete temporary databases under `%TEMP%`.
- Do **not** commit `data/`, `dist/`, `.opencode/`, credentials, captured sessions, or real local paths. They are gitignored; keep it that way.

## Baseline

- Commit `ed4ad9b` — `chore: checkpoint phase-1 closure and cockpit views`.
- Working tree was clean at handover except this file.
- Gate: **137 tests / 19 files green**, `npm run typecheck` clean, `npm run build` clean, pre-commit hook runs typecheck + full suite.

## Run the portal

```bash
npm run build
node dist/cli/index.js run --port 4319 --db "%TEMP%\tracevault-portal.db"
```

Then open http://127.0.0.1:4319/ . The 4319 port matters: the installed plugin (`.opencode/plugin/tracevault.js`) posts live events there. The service imports OpenCode's history at startup. If the local DB is stale or was hand-edited, delete `%TEMP%\tracevault-portal.db*` and restart to re-import (append-only store: this is the supported reset).

Note: imported history has no prompt events, so **turn dividers and replay only appear on sessions captured live after ticket 21**.

## Done (do not redo)

Old Phase-1 tickets 02/07/08/14 closed with live probes; import de-duplication fixed; 15 CI; 16 cockpit shell; 17 waterfall; 18 real durations; 19 file rail; 20 expression filters; 21 prompt capture; 22 turn grouping; 23 session-list enrichment; 25 graph view; 26 subagent nesting. Session list now ranks by **last activity**, not start time.

Evidence: `docs/probes/phase-1-live-probes.md`. Decisions are recorded at the bottom of the relevant ticket in `tickets/`.

## What is left

1. ~~**Ticket 24 — replay bar.**~~ **Done.** `ReplayBarView` + `ReplayTimeline`, `?t=<ms>` URL state, sticky bar, turn dimming, error/denied/gap ticks, keyboard controls, reduced-motion fallback. Registered in both composition roots. Live check: `?t=5000` on a seeded two-turn session marks turn 1 past, turn 2 active, bar and error tick present.
2. **Ticket 22 — one deferred box.** "Consecutive identical calls group into `N × command`." Deferred because collapsing changes row counts that the 1000-row and duplicate-row tests assert. Revisit those tests first, then implement.
3. **Ticket 10 — Phase 1 exit verification.** Not run. Checklist and demo steps in `docs/DEMO.md`; update its status table with what you actually observe. Two boxes need real conditions that did not exist here: two concurrent agent sessions, and a live browser scroll measurement (the CDP probe in `docs/probes` shows the method).
4. **Ticket 15 — two boxes need a push.** The workflow is committed; the fixture-hash and red-PR demos require a remote.
5. **Live `parentID` unverified.** Subagent nesting works from import; a subagent captured live may only get its parent link after the next import. Probe a real subagent spawn, then freeze the payload if the field exists.

## Known caveats (do not "fix" without a decision)

- Filtering is SQL + page navigation. The old "without reload" wording is withdrawn.
- Prompt text is truncated at 200 chars (`truncated: true` recorded).
- Harness-injected `<available-skills>` prompts are filtered out of turn dividers.
- Waterfall bars fall back to time-to-next-event for imported history without `state.time`; wide bars then mean pace, not tool duration.
- `SessionSummary` is split into `SessionSummaryCore` + enriched; the cockpit context uses the core so `DashboardServer`'s fallback object stays valid.
- The file rail follows the active filter (it can show "Files · 0" on a filtered view).

## Working rules

`AGENTS.md` is authoritative: OOD and TDD are the definition of done; tests attach at the two seams (A: HTTP → rendered page; B: raw hook payload → stored events), not one per class; no barrel files; no upward imports; composition roots only in `src/cli/`.

One deliberate exception exists and is documented in `tests/seams/gap.seam.test.ts`: plugin-local durable gap state is invisible to both seams, so it is tested across two plugin instances there. Do not add more exceptions without asking.

## First three commands

```bash
git log --oneline -3
npm run typecheck && npm test
npm run build && node dist/cli/index.js run --port 4319 --db "%TEMP%\tracevault-portal.db"
```

Then read `tickets/24-replay-bar.md` and start there.
