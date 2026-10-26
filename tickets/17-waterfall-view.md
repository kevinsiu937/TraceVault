# 17 — Waterfall view: activity as bars on a real time axis

**What to build:** A second view over the same session data: one horizontal bar per event, positioned by its timestamp on a real wall-clock axis, width by duration, colour by event kind (hook/document/mcp/skill/session/gap), errors get a solid red ring, denied a dashed amber ring, capture gaps render as a hatched uncovered band. Idle stretches between actions are visible as empty space. Toggling between Waterfall and List never changes the data — it is presentation only.

**Blocked by:** 16 — The investigation cockpit: three-pane session view.

**Status:** ready-for-agent

- [x] Every event renders as a bar: left = (t - t0)/total, width = duration/total, colour per the DESIGN.md kind palette
- [x] Axis ticks are real wall-clock times (prototype: `14:23:40 … 14:38:45`), not elapsed
- [x] Error events show a red ring; denied a dashed amber ring; capture gaps a hatched band labelled with the uncovered reason
- [x] Hover/click a bar selects the event and populates the detail panel
- [ ] Zoom and drag-to-select a time range filter the detail list (prototype showed pan/zoom on both axes in Langfuse/HoneyHive)
  - `from`/`to` filtering does not exist yet (ticket 20 / filter core), so drag-select cannot filter the list.
- [x] Seam-A test: a known event appears as a bar at the correct horizontal position for its timestamp

**Technical notes (from prototype):** Bar algorithm from prototype `003-real-session`: `left = t/S*100%`, `width = max(2%, d/S*100%)`. Until 18 lands, duration is time-to-next-event (idle-inclusive) — bars then show *pace*, not tool duration; the ticket is explicit about this so it does not read as a bug later.
