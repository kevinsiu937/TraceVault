# 19 — File-centric lens: which files did the agent touch

**What to build:** A file rail in the cockpit's left pane answers the question users actually ask first: *which files did the agent touch?* Files are derived from document.access targets, each showing its path and a ref count; expanding a file lists each touch with its time and event kind; clicking a ref jumps to that event in any view and highlights it.

**Blocked by:** 16 — The investigation cockpit: three-pane session view.

**Status:** ready-for-agent

- [x] Every distinct document.access target appears in the rail with a count
- [x] Expanding a file lists refs (time, kind) capped at a sane number, with a "+N more" collapse
- [x] Clicking a ref jumps to the event: switches to the list view, scrolls it into view, and flashes it
  - Link carries `#event-<id>`; the row has that id and a `:target` flash with a reduced-motion fallback.
- [x] Editing an existing file (edit vs read) is distinguishable in the ref list
- [x] Seam-A test: a session touching three files shows all three in the rail and the ref count matches

**Technical notes (from prototype):** Validated in `003-real-session` — 8 files derived from 39 document.access events, refs jumped and flashed correctly. This was the highest-value feature in the claude-replay research; keep it cheap (derive at render time, no new storage).
