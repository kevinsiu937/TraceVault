# 55 — Old databases keep working after an upgrade

**What to build:** the store records its schema version (`PRAGMA user_version`) and runs ordered migrations when it opens a file, inside one transaction. A migration adds tables, columns or indexes and never rewrites an event, so the hash chain stays valid. A file from a newer TraceVault is refused untouched. Event bodies pass through an upcaster when read; the integrity check reads them as stored.

**Blocked by:** — (scale spec approved)

**Status:** done

- [x] A database created before versioning opens, is upgraded, keeps every event, and its hash chain still verifies (Seam B)
- [x] Opening the same file twice changes nothing
- [x] A database with a newer version is refused with a message, and the file is unchanged byte for byte
- [x] The integrity check hashes events as stored, not as upcast
- [x] Typecheck, build and the full suite pass

**Technical notes:** `SchemaMigrations` (version in `PRAGMA user_version`) and `EventUpcaster` live in `src/store/`. `listAllOrdered` rows carry both the event as read today and as stored; `StoreVerifier` hashes the stored one. Test: `tests/seams/migration.seam.test.ts`. `SqliteEventStore` stays over 200 lines, as before this ticket.
