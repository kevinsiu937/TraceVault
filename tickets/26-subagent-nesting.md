# 26 — Subagents belong to their parent session

**What to build:** A subagent is part of the run that spawned it, not a peer. The main list shows root sessions only. A root session with subagents becomes a portal: it lists every subagent it used (agent, title, events, errors, duration, status) and each one opens its own cockpit. A subagent page links back to its parent.

**Blocked by:** 16 (cockpit shell), 19 (left rail slot). Ticket 21 is done — prompt events are independent of this.

**Status:** done — machine-store row count unverified, live `parentID` shape unproven

## Measured facts (26 Oct 2026, do not re-guess)

- OpenCode's store has `session.parent_id`: 44 roots, 21 children on this machine.
- Child titles already identify themselves, e.g. `Ticket 21 prompt events (@Sisyphus-Junior subagent)`.
- TraceVault captures none of it: `SELECT json_extract(data,'$.parent_id')` over 2,058 stored events is `null` for every row.
- `OpenCodeStoreSource.listSessions()` selects `id, title, agent, time_created, time_updated` — `parent_id` is not read.

## Design

1. **Capture (import, proven source).** `SessionStoreSource.AgentSessionRecord` gains `parentId: string | null`; `OpenCodeStoreSource` selects `parent_id`. `HistoryImport` writes it into the `session.start` event data.
2. **Capture (live, needs a probe).** The plugin's `session.created` event may carry `info.parentID`. Add it to the forwarded payload if present, accept it as an optional string in `HookPayloadParser`, and validate that it is a non-empty string or null. Probe one real subagent run first and freeze the payload; if the field is absent, live children simply carry `null` and the next restart's import fills it (document that).
3. **Schema.** `SessionLifecycleData` gains `parent_session_id: string | null`. Envelope unchanged.
4. **Service.** `SessionSummary.parentSessionId: string | null`. `listSessions()` returns **roots only** (`parentSessionId === null`). New `listSubagents(parentId): SessionSummary[]`, ordered by start time. `hasSession()` still answers for children so their pages stay reachable.
5. **Dashboard.** Main list hides children (no separate rows). A root session with children renders a **Subagents** portal above the cockpit grid: one card per child with title, agent, events, errors, duration and status, linking to `/sessions/<childId>`. A child page renders a `↑ Parent session` link in the header. The portal is a `SessionPaneView` with `slot: "bottom"` so the shell composes it without special-casing.
6. **Existing databases.** The store is append-only, so already-imported `session.start` rows cannot be edited. Document: delete the local events DB and restart to re-import, or add a `session.parent` event type in a later ticket. Do not rewrite history.

## Acceptance

- [x] Main page shows 44 rows, not 65, against this machine's store (verified: 44)
- [x] A root session with children shows a Subagents portal naming each child
- [x] Clicking a child opens its cockpit; that page has a working `↑ Parent session` link
- [x] A root without children shows no portal
- [x] Seam-A test: parent page lists N children, main list excludes them, child page links back
- [ ] Imported child sessions carry the real `parent_session_id`; a child captured live without the field is still grouped after the next import

Imported children do carry `parent_session_id` (seam B, temp OpenCode-shaped store). The
second half is not proven: `HistoryImport` skips its `session.start` when a live one already
exists, so a live child captured without `parentID` keeps no parent link after re-import
today — it needs a separate `session.parent` event (design item 6) to backfill.

## Notes

- 21 of 65 stored sessions on this machine are children, so this removes a real third of the list noise.
- Do not delete or hide a child session itself; only its row in the main list.
- The portal must not change the cockpit's 230px/1fr/330px grid.
- Live `session.created` forwarding of `parentID` from `event.properties.info.parentID` is a
  guessed payload shape, not a probed one. It is additive: absent or wrongly typed, the child
  simply stores no parent link. A probe of a real subagent run is still needed to freeze it.
- `listSessions()` still returns every session, including children (deliberate: the cockpit
  header needs the current child's own summary). Root filtering lives in `SessionListView`.
