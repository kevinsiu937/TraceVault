# 20 — Expression filters: field:value over the timeline

**What to build:** The filter bar grows from kind/outcome chips to a single expression input with typeahead on field names. Grammar (validated in prototype): `kind:mcp`, `outcome:error`, `duration:>60`, `path~status_card`, bare words match target text, `"exact phrase"` quoted. Filters apply to BOTH the waterfall and the list simultaneously, the status line shows `N / total events shown`, and the query serializes into the URL so a filtered view is restorable.

**Blocked by:** 13 — Filters: show me only what I care about. 16 — The investigation cockpit: three-pane session view.

**Status:** ready-for-agent

- [x] `kind:` and `outcome:` filters match event kind and outcome exactly
- [x] `duration:>N` matches stored duration (uses 18's duration when present)
- [x] `path~substr` matches target text substring; bare words do the same for target + kind label
- [x] Chips and expression compose; applying either filters both waterfall and list (SQL filtering + navigation; the "without reload" wording is withdrawn by decision)
- [x] The current filter state round-trips through the URL
- [x] Seam-A test: URL with `kind=mcp&outcome=error` yields only matching rows in both views

**Decision note:** filtering is server-side SQL; applying a filter navigates (page load) and re-renders both
views. The "without reload" clause is withdrawn. `kind:` matches the exact type or its family prefix
(`kind:mcp` → `mcp.call`), and `N of M events` keeps the existing status wording.


**Technical notes (from prototype):** Full grammar + matcher logic shipped in the mockup `003-real-session` (parseExpr/evMatches in the inline script) — that file is the reference implementation for behaviour, not the production code. This is Seam-A-friendly: every criterion ends in a page assertion.
