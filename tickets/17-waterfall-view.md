# 17 — Waterfall view: activity as bars on a real time axis

**What to build:** A second view over the same session data: one horizontal bar per event, positioned by its timestamp on a real wall-clock axis, width by duration, colour by event kind (hook/document/mcp/skill/session/gap), errors get a solid red ring, denied a dashed amber ring, capture gaps render as a hatched uncovered band. Idle stretches between actions are visible as empty space. Toggling between Waterfall and List never changes the data — it is presentation only.

**Blocked by:** 16 — The investigation cockpit: three-pane session view.

**Status:** done

- [x] Every event renders as a bar: left = (t - t0)/total, width = duration/total, colour per the DESIGN.md kind palette
- [x] Axis ticks are real wall-clock times (prototype: `14:23:40 … 14:38:45`), not elapsed
- [x] Error events show a red ring; denied a dashed amber ring; capture gaps a hatched band labelled with the uncovered reason
- [x] Hover/click a bar selects the event and populates the detail panel
- [x] Zoom and drag-to-select a time range filter the detail list (prototype showed pan/zoom on both axes in Langfuse/HoneyHive)
- [x] Seam-A test: a known event appears as a bar at the correct horizontal position for its timestamp

**Technical notes (from prototype):** Bar algorithm from prototype `003-real-session`: `left = t/S*100%`, `width = max(2%, d/S*100%)`. Until 18 lands, duration is time-to-next-event (idle-inclusive) — bars then show *pace*, not tool duration; the ticket is explicit about this so it does not read as a bug later.

**DECISION (zoom):** the selected range is a filter, not browser state. Dragging across the plot writes `from`/`to` (ISO-8601 UTC) into the URL and the page reloads; the range goes through `ActivityFilter` into SQL like every other filter, so the list, the waterfall, the file rail and the live stream all agree. The waterfall axis then spans exactly the selected window — that is the zoom. `Reset zoom` (waterfall) and the range chip (list filter bar) clear it; other filter chips keep it. An unreadable bound means no range: only `YYYY-MM-DDTHH:MM[:SS[.sss]]Z` is read, so a bound without `Z`, a bare number or an extended year is ignored. A capture gap matches a range when its outage overlaps it, not by its own timestamp, so zooming into an outage shows the gap instead of an empty plot. The live stream applies the same SQL filter: an event absent from the filtered timeline is not sent. Zoom is horizontal only: one lane per event already fits the vertical axis. Drag is pointer-only; the URL is the keyboard path. Live check in headless Chrome: a drag across 20–60% of a 15-event session navigated to a 2-event window with rescaled ticks, and a plain click on a bar still selected it. The drag gesture is browser script that Seam A cannot reach; it is checked only in headless Chrome, outside the gate. Seam A pins what the script reads (`data-t0`, `data-span`).
