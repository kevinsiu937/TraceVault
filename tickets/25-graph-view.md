# 25 — Graph view: the run as structure

**What to build:** A third view condenses the session into structure: nodes aggregated by event kind (with counts and first-seen time), edges between consecutive groups, and an error edge painted red when any event in a group failed. The whole run reads as investigate → patch → test → verify instead of a scroll of rows. Aggregation happens at render time over the stored events — no new storage.

**Blocked by:** 16 — The investigation cockpit: three-pane session view.

**Status:** ready-for-agent

- [x] Consecutive same-kind events aggregate into one node showing kind, count, and error count
- [x] Edges connect groups in execution order; an edge turns red if its group contained an error
- [x] Clicking a node switches to the List view at that group's first event
- [x] A session with no errors reads as a clean chain; with errors, the failing step is visible without opening anything
- [x] Seam-A test: an 85-event fixture with 4 errors renders ≤10 nodes with exactly the failing group's edge red

**Technical notes (from prototype):** Prototype `002-cockpit`'s Graph view is a static stand-in; the real algorithm is the render-time aggregation described above (validated against the real 85-event session: 38 hook + 39 document + 6 mcp events collapse to ~6 groups). Research source: Opik "Show Agent Graph" and Langfuse agent-graphs — both infer structure from nesting/timing; ours infers from kind runs, which the data actually supports.
