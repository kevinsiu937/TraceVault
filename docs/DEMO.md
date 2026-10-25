# Phase 1 demo — capture, store, list, timeline

Runs on Windows, Node 24+, from a clean clone. Nothing leaves the machine.

## 1. Build and start

```bash
npm install
npm run build
node dist/cli/index.js init --dir .
node dist/cli/index.js run --port 4319 --db data/demo.db
```

Open http://127.0.0.1:4319/ . The list shows one row per session with agent, start, end/open and activity count.

## 2. Run a real agent session

In a second terminal, in the same directory:

```bash
opencode run --auto "Use these tools in order, one call each: 1) bash: echo hello > demo.txt  2) edit demo.txt replacing hello with world  3) fetch https://example.com. Then reply DONE."
```

Refresh the list: the session appears with the number of actions. Click it: the timeline shows, in order:

```
session.start
hook.script      echo hello > demo.txt        ok
document.access  demo.txt (read)              ok
document.access  demo.txt (write)             ok
hook.script      https://example.com          ok
session.end
```

A session still running has no `session.end` and is shown as `open`. A second event after an end reopens the session.

## 2b. Visual timeline and filters

The session page is a vertical timeline: one marker per event coloured by kind, time, kind, target and outcome on every row. Click a row to expand the stored event detail in place; the legend shows the kinds in this session with counts.

Filters are URL state, so every view is bookmarkable:

```text
/sessions/<id>?kind=document.access&operation=write   files modified in this session
/sessions/<id>?outcome=error                           failures in this session
/sessions/<id>?q=vault                                 free text over targets
/activity?kind=document.access&operation=write         documents modified, all sessions
/activity?kind=skill.call                              skills used, all sessions
/activity?outcome=error                                everything that failed
```

The chips at the top of the page are the same filters in one click. `/activity` groups matching rows by session, newest session first.

## 3. Errors, duplicates, gaps

- A tool that fails is recorded from the `message.part.updated` error state as `outcome=error`; the page gives it `class="pill error"`.
- A repeated observation with the same call id is stored twice plus a `capture.duplicate` row; the timeline shows the action once.
- If the service is unreachable, the plugin remembers the interval and posts a `capture.gap` on recovery; the timeline shows a `gap` row with the reason.

## 4. Reversible install

```bash
node dist/cli/index.js uninstall --dir .
node dist/cli/index.js init --dir .
```

Uninstall restores a pre-existing `.opencode/plugin/tracevault.js` byte-for-byte (proven in `tests/seams/install.seam.test.ts` by a base64 snapshot of the whole temporary project).

## 5. Gate

```bash
npm run typecheck
npm run build
npm test
```

7 seam files, 50 tests: capture (15), timeline (8), filters (6), history (7), sessions/list (5), integrity (4), install (5).

## Phase 1 exit checklist

| Criterion | Status | Evidence |
|---|---|---|
| Real session with shell, edit and fetch appears in order | PASS | `data/demo2.db` session `ses_e8c664512ffeMGlUg4majZGzMD` — 6 ordered events |
| Session list on loopback with start, end/open, count, agent | PASS | `GET /` row: end `2026-10-25T15:07:35.340Z`, count 4 |
| Errors and denials distinguishable | PARTIAL | error PASS (live POST + seam); denial path is an error-text heuristic; a live denied call could not be reproduced in this environment |
| Ordering deterministic at equal timestamps | PASS | `capture.seam.test.ts` "orders two events with identical timestamps" |
| Duplicate observation recorded and collapsed once | PASS | store has 2 actions + 1 duplicate; timeline shows 1 |
| Append-only hash chain, tamper detected | PASS | `integrity.seam.test.ts` UPDATE and DELETE both fail with session + position |
| Gaps visible as data | PASS | `capture.gap` stored; timeline renders `outcome-gap` |
| Live timeline without reload | PASS (transport) | SSE seam test receives a new event; dedupe/positioning script in page |
| Install/uninstall byte-identical | PASS | `install.seam.test.ts`, 5 tests |
| Two concurrent sessions stay separate | PARTIAL | seam-A interleaved-session test PASS; two real sessions captured separately, but a second concurrent `opencode` process did not start under this nested runner |
| 1000-event page renders without stall | PASS | `timeline.seam.test.ts` renders 1000 rows; response under 2s on the local run |
| No scroll jump on live insert | NOT MEASURED | requires a real browser session |

## Known limitations

- Denials are inferred from the tool error text (`denied|permission|rejected|blocked`); the live denial path was not reproducible here.
- `data.target` stores command/URL/path text; redaction is not implemented (documented debt from ticket 02's predecessor).
- `EVENT-SCHEMA.md` is still marked unapproved; the code emits `schema_version: 1`.
- MCP capture was measured from real hook payloads and pinned by a seam test; no MCP call was routed through the running service during this demo.
- A pre-existing database with the old schema is not migrated; delete `data/*.db` before this version.
