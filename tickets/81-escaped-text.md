# 81 — Text reaches a page through one escaping rule

**What to build:** 24 dashboard view files each carry a private `escape` method and an `ESCAPES` table. All 24 copies are byte-identical today. They are the only defence against a tool description, a file path or a command that contains HTML, and nothing but habit keeps a new view from skipping it. One value object holds text that is safe to put in a page: it is made by escaping, and the views write session data only through it. The 24 copies go.

A wide, mechanical change: add the value object first, move the views over in batches (report views, session panes, the rest) with the suite green after each, then delete the last private copy.

Refactor: every rendered page and report keeps its bytes. From the 15 Nov 2026 architecture review, candidate 5. The working agreement forbids `utils.ts` and `helpers.ts`; this is a value object with one rule, which the same agreement asks for.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] One escaping rule exists in the dashboard; no view defines its own
- [x] The report for the Phase 4 exit session is byte-identical before and after
- [x] The existing "escapes session data in the page" tests pass unchanged
- [x] A session whose title, command, file path, gap reason and tool description each hold `<script>` renders none of them as markup, on the session page, the configuration page and the report (Seam A)
- [x] Typecheck, build and the full suite pass

**Done (16 Nov 2026):** `src/dashboard/HtmlText.ts`. Every page and report of the Phase 4 exit database and five other probe databases (a copy of each) rendered the same bytes before and after.
