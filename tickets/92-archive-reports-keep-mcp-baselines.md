# 92 — An archived report preserves its MCP tool comparison context

**What to build:** Archiving a session preserves the MCP tool-change findings that its report would show before the move, including the baseline and applicable developer acceptances. A report produced from an archive must not silently treat a changed tool list as its own trusted first sighting.

**Blocked by:** None. Follow-up to completed tickets 59, 66 and 85. Coordinate shared archive changes with ticket 91, but neither implementation requires the other.

**Status:** pending

**Priority:** P2 follow-up improvement.

**Existing contract:** The scale specification explicitly documents that an archived report computes tool changes against the archive's tool lists and may therefore use a different baseline. This ticket deliberately improves that known limitation. It is not an unexpected regression in ticket 59. The follow-up requires a reviewed design and an update to that documented limitation when the implementation is accepted.

**Evidence:** Record an original tool list in session A and a changed description in session B. B's report contains a tool-change warning. Archive B while A stays in the main database as required. The same report command against the archive no longer shows that warning, despite unchanged tools, rules and acceptance decisions.

**Demo:** Export the affected session before and after archiving it, then reopen the archive without the main database. Both reports identify the same tool changes and the same applicable baseline.

- [ ] Pin the current discrepancy with a failing integration regression before implementing the fix.
- [ ] Present the design for preserving baseline and acceptance context before introducing any new storage shape, files or stage-observability changes. Keep the original and accepted baseline events in the main database as required by existing tickets.
- [ ] An original-baseline tool-change warning keeps the same rule, subject, baseline meaning and evidence after archiving and reopening.
- [ ] Cover a baseline accepted before the session, a later change after that acceptance, and an acceptance made after the session. Later acceptances must not retroactively alter its findings.
- [ ] A clean session stays clean; missing comparison evidence is expressed as unavailable rather than silently inventing agreement.
- [ ] Verify findings through the actual capture/service path and warning evidence through rendered reports. The CLI and session-page report remain byte-identical for the same database, session and rule choice.
- [ ] The archive can reproduce the comparison with the main database unavailable, without network access or stored findings. Recorded events are not rewritten, and both files still verify.
- [ ] Cover rules then and now without changing which rule set the caller selected. Replace the documented archive-baseline limitation with the implemented behavior and any remaining limits.
- [ ] Typecheck, build and the full suite pass locally.

**Scope:** Preserve comparison evidence for a single archived session's report. No multi-session export, remote storage or new trust authority.
