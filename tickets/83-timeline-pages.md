# 83 — A long session's page opens in pages

**What to build:** The session page renders every row. A 50,000-event page is 110 MB of HTML and takes 3.5 s even when its findings are cached (`docs/probes/scale-measurements.md`), and a browser struggles with it. The timeline shows one page of rows, 500 by default, newest page first, with links to the previous and next page. A filter applies to the whole session before paging, and a link to one event opens the page that holds it. The live stream adds rows to the page being viewed only when it is the newest page.

The report is not paged. It is the whole record, taken away as one file.

From the "long sessions" candidate in `HANDOVER.md`.

**Blocked by:** None. If 78 is done, page on its one read of the session; if not, keep to today's calls.

**Status:** ready-for-agent

- [ ] A session with more rows than one page shows one page and links to the others, and a session with fewer shows no page links (Seam A)
- [ ] A filtered page counts only the matching rows (Seam A)
- [ ] A link to an event on an earlier page opens that page with the event selected (Seam A)
- [ ] The findings panel, the file rail and the counts in the header still describe the whole session, not the page (Seam A)
- [ ] The report of a long session still lists every row, and the report from the CLI and from the page stay byte-identical
- [ ] `measure-scale.mjs` gets page-size and time rows for 10,000 and 50,000 events
- [ ] Typecheck, build and the full suite pass
