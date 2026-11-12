# 50 — "Export report" on the session page

**What to build:** `GET /sessions/:id/report` returns the report as a download, and the session header links to it. The route and the CLI share one `ReportView`, so their bytes are identical.

**Blocked by:** 47

**Status:** done

- [x] The session header has an "Export report" link (Seam A)
- [x] The route answers with `Content-Disposition: attachment` and a file name containing the session id
- [x] The route's body equals the bytes `tracevault report` writes for the same session
- [x] An unknown session answers 404
- [x] Typecheck, build and the full suite pass
