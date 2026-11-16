# 77 — Seam tests run the assembly the user runs

**What to build:** 23 seam test files build the investigation service by hand, in four different constructor shapes, and 21 build the dashboard server by hand. Only 3 go through `ServiceAssembly`. The pane list exists three times: `run` has nine panes, the server's built-in default has six (no findings panel, no skipped calls, no rules notice), and `measure-scale.mjs` keeps its own copy. So most tests exercise wiring nobody runs, and a constructor change edits two dozen files. One assembly builds the service and the dashboard for a database path and a rules folder; `run`, the probe scripts and the seam tests all get them from it.

Refactor: no behaviour changes. From the 15 Nov 2026 architecture review, candidate 3.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] `run` and the seam tests obtain the dashboard server from the same assembly, with the same nine panes
- [x] The dashboard server no longer has a default pane list of its own
- [x] No seam test constructs the investigation service or the dashboard server directly; a test that needs a special collaborator (a clock, a failing scanner) passes it to the assembly
- [x] The probe scripts that build a dashboard (`measure-scale.mjs`, `measure-live.mjs`) use the assembly
- [x] Every existing seam test still asserts what it asserted; any that only passed because a pane was missing is fixed, and the ticket says which
- [x] Typecheck, build and the full suite pass

**Notes (16 Nov 2026):** `ServiceAssembly.open(db, printError?)` now returns the service, the store and the dashboard server with the nine panes; `run`, the seam tests, `measure-scale.mjs` and `measure-live.mjs` take them from there. The only special collaborator a test needed was the dashboard's error line (ticket 74's test). No seam test failed under the nine panes, so none had to be fixed. `cockpit.seam` used to put `SessionRailView` in the left slot; it now gets `FileRailView` like `run`, and `SessionRailView` is referenced by nothing (left in place; deleting it is a one-file follow-up). Every page and report of six probe databases rendered the same bytes through the assembly as before.
