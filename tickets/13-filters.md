# 13 — Filters: show me only what I care about

**What to build:** The reader can narrow what they are looking at. Inside a session: filter by event kind, by outcome, and by free text over targets. Across all sessions: one view that answers "every document that was modified", "every skill that was used", "everything that failed" — the same rows, grouped by session, newest first.

Filters live in the URL, so a filtered view can be bookmarked and reloaded; they also appear as one-click chips at the top of the page. Filtering is a query over the store, not a client-side hide — the page must stay fast with thousands of events.

The vocabulary is the domain one: kind, outcome, target, session, agent.

**Blocked by:** 12 — A timeline you can read at a glance.

**Status:** done

- [x] A session timeline can be filtered by kind, by outcome, and by text over targets
- [x] A cross-session activity view lists matching events grouped by session, newest first
- [x] "Documents modified" and "skills used" are each reachable in one click
- [x] Filter state is encoded in the URL and survives reload and bookmarking
- [x] Filtering happens in the query layer, not by hiding rows in the browser
- [x] Empty results say so explicitly instead of rendering a blank page
- [x] Seam test: a request with a filter returns only matching rows, and the count matches the store
