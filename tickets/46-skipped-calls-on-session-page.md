# 46 — Skipped calls at the top of the session page

**What to build:** a "Skipped calls" list above the Findings panel, built from stored events that carry `blocked_by`. Each item names the tool, the target, the rule that skipped it and that rule's recommendation, and links to the event in the detail pane. The list is absent when nothing was skipped.

**Blocked by:** 45

**Status:** done

- [x] A session with a call refused by the guard shows the list with the rule id and recommendation (`guard.seam.test.ts`, which builds the page over the recorded refusal `tool-refused-by-hook.json`)
- [x] The item links to the denied event
- [x] A session with a denial not caused by the guard (a permission rejection) shows no list
- [x] A session with no skipped call shows no list
- [x] Typecheck, build and the full suite pass
