# Spec: Scale and architecture before Phase 5

> Status: approved 13 Nov 2026. Kevin decided on 13 Nov 2026: local single-user by design; measure before optimising; old sessions can be viewed under the rules then and now; old sessions are archived automatically after 90 days (configurable), as ticket 59 if the numbers call for it.
> Tickets: `tickets/55-*` to `tickets/59-*`. Structure rules: `AGENTS.md`, `docs/ARCHITECTURE.md`.

## Problem Statement

Four limits stood between Phase 4 and Phase 5:

- A database created by one version of TraceVault had no record of its own shape, so an upgrade that changed the tables could not tell old files from new ones, and could not refuse a file it did not understand.
- Every page load rescans the whole session, and nobody knew how slow that gets.
- Findings are computed at read time with the current rules. After a rule edit, nobody can see what the rules said when the session happened.
- Nobody knew how fast the database grows, or what fills it.

## Solution

- The store records its schema version and upgrades older files when it opens them, without rewriting a single event. A file from a newer TraceVault is refused untouched.
- A measurement script puts numbers on speed and size, and those numbers decide whether a cache, deduplication (58) and archiving (59) are built.
- The service keeps every rule set it has used, by digest, and remembers which one was current when each session was recorded. A session can be viewed under the rules then and now.

**Local single-user is a design decision, not a limit.** Records hold commands and file paths as written. Keeping them on one machine, on 127.0.0.1, without accounts, is the safer default. Sharing goes through the exported report (Phase 4).

## User Stories

1. As a developer, I want my existing database to keep working after I upgrade TraceVault, so that I never lose recorded sessions.
2. As a developer, I want an upgrade never to rewrite recorded events, so that the hash chain still proves nothing was changed.
3. As a developer, I want an older TraceVault to refuse a database from a newer one, so that it cannot damage data it does not understand.
4. As a developer, I want numbers on how slow and how big things get, so that optimisation is spent where it is needed.
5. As a developer, I want to see a session judged by the rules in force when it was recorded, so that I can explain what TraceVault said at the time.
6. As a developer, I want today's rules by default, with a plain notice when the old rules say something different, so that I see both without hunting.
7. As a developer, I want a session recorded before rule sets were kept to say so, so that missing history is never shown as agreement.

## Implementation Decisions

**Schema version (ticket 55).** SQLite's `PRAGMA user_version` holds the version. `SchemaMigrations` holds an ordered list of migrations. Opening a store reads the version first; a version newer than the code knows is refused with a message, and the file is closed before anything is written. Otherwise every pending migration runs inside one transaction, and the version is set at the end. Migration 1 is the original table and indexes, written `IF NOT EXISTS`, so a file created before versioning becomes version 1 without change. A migration may add tables, columns and indexes only. It never updates or deletes an event row.

**Upcasting at read time.** An event body is turned into the current shape when it is read, by `EventUpcaster`. Today it only turns a missing `duration_ms` into `null`. A future `schema_version` adds its step there. The integrity check reads the stored bytes as written, never upcast, because the hash covers what was stored.

**Measurement (ticket 56).** `docs/probes/scripts/measure-scale.mjs` runs against `dist/`. It builds sessions of 1,000, 10,000 and 50,000 events with the mix of the Phase 2 exit run, times the service and the pages, and measures the database. Results and their explanation live in `docs/probes/scale-measurements.md`. It is not part of the gate. The proposed threshold is a session page under one second.

**Findings cache (ticket 57, called for by ticket 56).** `SessionFindings` keeps the findings of the last 16 sessions it scanned, keyed by session, event count and last event, so a new event is always a miss. Each rule set has its own `SessionFindings`, so the rule-set digest is part of the key.

**Rules then and now (ticket 57).**
- When the service starts, it stores the content of every rule file (`rules/*.yaml`, `rules/lists/*.yaml`, `rules/config/*.yaml`) under the rule-set digest, once per digest.
- When the service stores the first event of a session, it records the digest that was current. That is "then": the rules in force when the session was recorded.
- The service can compute findings, and configuration findings, under a stored digest, by rebuilding both scanners from the stored files.
- The session page and the report show today's rules. When "then" is known and its findings differ, one plain line says so and links `?rules=then`. A session recorded before this feature says the rules from that time were not kept.

## Testing Decisions

- **Seam B** opens databases: a file without a version is upgraded with every event kept and the chain verified; opening twice changes nothing; a newer file is refused and left byte for byte.
- **Seam C** compares findings under a stored digest with findings from loading the same files from disk.
- **Seam A** renders a session recorded under one rule set and viewed after the rules changed: today's findings by default, the notice, and the old findings under `?rules=then`; and the "not kept" line for an older session.
- Measurement is a probe outside the gate.

## Out of Scope

- Accounts, a shared server, and syncing between machines.
- Storing findings. They stay a read model.
- Deduplication (58) and archiving (59) until ticket 56's numbers call for them.
- Migrations that rewrite event bodies.

## Known Blind Spots

- "Then" is the rule set of the service that stored a session's first event. A session recorded while rules were edited on disk, without restarting the service, keeps the rules the service had loaded.
- A rule set stored by an older TraceVault that this version can no longer load counts as not kept.
- Live updates on an open session page flag new rows with today's rules, even when the page shows "then".
- A rule set is stored by its digest and file contents; rules edited and reverted produce the same digest and the same stored set, which is the intent.
- The first view of a long session still scans it whole, and three session-window rules grow with the square of its length: about 3 s at 10,000 events and 54 s at 50,000 (`docs/probes/scale-measurements.md`). The findings cache only makes repeat views fast.
- The session page renders every row: at 50,000 events it is 110 MB of HTML and takes 3.5 s even with the findings cached.
- Measurement uses synthetic sessions modelled on one recorded run, so real sessions with other mixes can behave differently.
