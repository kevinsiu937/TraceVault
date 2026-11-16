# 83 — A long session's page opens in pages

**What to build:** The session page renders every row. A 50,000-event page is 110 MB of HTML and takes 3.5 s even when its findings are cached (`docs/probes/scale-measurements.md`), and a browser struggles with it. The timeline shows one page of rows, 500 by default, newest page first, with links to the previous and next page. A filter applies to the whole session before paging, and a link to one event opens the page that holds it. The live stream adds rows to the page being viewed only when it is the newest page.

The report is not paged. It is the whole record, taken away as one file.

From the "long sessions" candidate in `HANDOVER.md`.

**Done (16 Nov 2026):** `TimelinePage` cuts the filtered timeline into pages of 500, oldest on page 1, so a page keeps its rows as the session grows; `?page=` picks one, `?event=` opens the page holding that event, and the newest page is the default. The live stream adds rows only on the newest page. `tests/seams/timeline-pages.seam.test.ts` proves it; the old "a thousand events in one page" test now checks two pages of 500. 50,000 events: page 17.7 MB (was 110 MB), repeat view 944 ms (was 2,677 ms); most of what is left is the findings panel, which describes the whole session.

**Blocked by:** None. If 78 is done, page on its one read of the session; if not, keep to today's calls.

**Status:** done

- [x] A session with more rows than one page shows one page and links to the others, and a session with fewer shows no page links (Seam A)
- [x] A filtered page counts only the matching rows (Seam A)
- [x] A link to an event on an earlier page opens that page with the event selected (Seam A)
- [x] The findings panel, the file rail and the counts in the header still describe the whole session, not the page (Seam A)
- [x] The report of a long session still lists every row, and the report from the CLI and from the page stay byte-identical
- [x] `measure-scale.mjs` gets page-size and time rows for 10,000 and 50,000 events
- [x] Typecheck, build and the full suite pass
