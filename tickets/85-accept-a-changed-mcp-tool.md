# 85 — A changed MCP tool can be accepted

**What to build:** `tool-changed` (ticket 66) compares each MCP tool with its server's first recorded tool list. When a server's tools change on purpose, for example after an upgrade, every later session reports the change again, and nothing stops it. The developer accepts the server's current tools, and from then on those tools are the baseline: a later change is reported, and the accepted one no longer is.

The acceptance is recorded, never a rewrite: the store is append-only, and the first tool list stays where it is. How and where the acceptance is recorded is the first design decision. Events belong to sessions, and an acceptance does not. Write the options and the choice in the ticket before any code. A CLI command (`tracevault trust <server> [--db]`) is the smallest way to accept. A button on the configuration page would need the service to take a write that is not a hook payload, so it is out unless Kevin asks for it.

**Blocked by:** None.

**Status:** open; design written 16 Nov 2026, waiting on Kevin. Every workable option records something the store does not record today (an acceptance), so it is his decision under the working agreement. No code yet.

**Where an acceptance can be recorded.** Today the baseline is each server's earliest `mcp.tools` event in any session (`SessionConfiguration.firstSeen`), passed to the static scanner's `changed_since_first_seen` check. The store has the hash-chained `events` table, chained per session, and two tables outside the chain (`rule_sets`, `session_rules`, migration 2).

1. **A new event type, `mcp.accepted`** (server, the id of the accepted `mcp.tools` event), appended under a reserved session. Hash-chained, so `tracevault verify` covers it. Costs: a new event type in `schema/`, and a pseudo-session that the session list, the report and the scale queries must all hide, while events are meant to belong to real sessions.
2. **A new table, `mcp_trust (server, event_id, accepted_at)`**, migration 3, rows only ever added; the latest row per server wins. The row points at an existing `mcp.tools` event, so nothing is copied and the first list stays where it is. This follows the `session_rules` precedent: a decision that belongs to no session lives in a table. Cost: the row is outside the hash chain, so `verify` vouches for the accepted list but not for the acceptance. Deleting a row by hand only brings the finding back, which is the safe direction.
3. **A copy of the current list as an `mcp.tools` event in a reserved session**, with "latest list in that session, else the first" as the baseline. No new type or table, but it stores a tool list no agent reported at that moment, so a fabricated sighting sits among the evidence, and every reader of `mcp.tools` (the configuration page, the cross-session query in `InvestigationService`) would take it for a real one.
4. **A file outside the database** (a trust list in the state folder). It records nothing in the store, but it does not travel with the database, is not tamper-evident, and fails the spirit of "survives reopening the database".

**Recommendation: option 2.** An acceptance is the developer's decision, not evidence of what the agent did, and the store already keeps decisions of that kind (`session_rules`) in a table. The baseline it points to is still a chained event. Option 1 is the choice if Kevin wants the acceptance itself to be tamper-evident.

**A sub-decision to take with it:** findings are computed when a page is read, so after an acceptance, older sessions would also stop reporting the change. I recommend that each session is compared with the latest acceptance made before its configuration snapshot (else the first list). Sessions recorded before the acceptance then still show what they showed, and the finding names its baseline ("since `<server>` was accepted, `<time>`" or "first seen").

- [ ] After accepting a server, a later session with the same tools raises no `tool-changed` finding (Seam B)
- [ ] A change after the acceptance is still reported, and names the acceptance as the baseline (Seam B)
- [ ] Accepting a server never seen is refused with a clear message, and exits 1
- [ ] The acceptance survives reopening the database, and `tracevault verify` still passes
- [ ] The first tool list is never changed or removed; the ticket 59 constraint (keep each server's first list) still holds
- [ ] `docs/spec/evasion-before-phase-5.md`'s out-of-scope line about accepting a change points here
- [ ] Typecheck, build and the full suite pass
