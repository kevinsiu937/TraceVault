# 24 — Replay bar: watch the session happen

**What to build:** A fixed bottom control bar turns the timeline into a re-watchable session: play/pause, step forward, a scrubber with a dot per turn and markers for key moments, speed 0.5×–4×, elapsed/total. During playback, past turns dim and the active one brightens, revealing the session as a sequence rather than a static feed. All of it is one inline script on the existing page — no client build.

**Blocked by:** 16 — The investigation cockpit: three-pane session view. 22 — Turn-grouped collapsible list.

**Status:** ready-for-agent

- [ ] Play/pause, step, scrubber, speed control and timer work on a session timeline
- [ ] During playback, completed turns dim (opacity fade) and the active turn stays bright
- [ ] Key-moment markers (errors, denied, gaps) appear as ticks on the scrubber; hover shows their label
- [ ] Keyboard: space play/pause, ←/→ step
- [ ] `prefers-reduced-motion` disables the dimming animation (per DESIGN.md)
- [ ] Seam-A test: playback state advances the active turn marker across a fixture session

**Technical notes (from prototype):** Prototype `001-transcript` implements the full bar (play button, scrubber with tick marks, speed select, timer, dimming). Research source: claude-replay — one self-contained HTML file with vanilla JS proved this fits the no-build constraint. The dimming is CSS opacity classes; the scrubber is a positioned div, not an `<input type=range>`, so ticks render deterministically.
