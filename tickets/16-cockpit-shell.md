# 16 — The investigation cockpit: three-pane session view

**What to build:** The session detail page becomes the cockpit layout validated in prototype `003-real-session`: a dark three-pane view — file rail (left), views (center), event detail (right). The header carries aggregate stats and Prev/Next session stepping. Clicking any event opens its detail in the right pane with Details / JSON tabs (stored event shown verbatim). This is the shell everything else in the UI set hangs off.

**Blocked by:** 04 — The session timeline page. 12 — A timeline you can read at a glance.

**Status:** ready-for-agent

- [x] Session detail renders in three panes: 230px file rail · center views · 330px detail panel, sticky rails, dark theme per DESIGN.md dark tokens
- [x] Header shows title, session id, agent, duration, event count, error/denied counts, start time (wall-clock), and Prev/Next session buttons
- [x] Clicking an event row selects it and shows its detail: event id, kind, target, outcome, duration, wall-clock time, and the stored event JSON in a Details/JSON toggle
- [x] A gap event renders distinctly; denied and error states are never colour-only (pill text present)
- [x] Seam-A test: selecting an event shows its stored JSON in the right pane

**Technical notes (from prototype):** Grid is `230px 1fr 330px`; rails `position:sticky`. Times are wall-clock `HH:MM:SS`, never elapsed — the prototype showed elapsed times mislead (a 15-minute session read as 4 minutes). Event IDs shown are the real stored ids. No client build: server-rendered HTML + one inline script, per DESIGN.md.
