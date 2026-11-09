# 29 — Probing: repeated denied calls

**What to build:** `probing` matches three or more denied calls inside the window. A denial is the stored `denied` outcome, not a plain error. All the denied rows carry the flag.

**Blocked by:** 28.

**Status:** done

- [x] Three denied calls inside the window flag all three rows with one finding
- [x] Two denials, or three plain errors, produce no finding
- [x] The same denied call seen by both the live hook and the history import counts once
- [x] Seam C trigger and clean fixtures. The trigger is authored in the shape of the recorded auto-rejected call in `tests/fixtures/tool-failed-denied.json`; ticket 33 records real auto-rejected `ask` calls from an `opencode run` session

**Technical notes:** The repeat count is a step property in the rule file, not a special rule kind. Counting runs over the deduplicated timeline, the same one the page renders.

**Implementation notes (7 Nov 2026):**
- A step may say `repeat: n`. A rule that repeats a step, or has several steps, must declare a window.
- An event that advances an open match does not also start a new one. Five denials therefore give one finding for the first three, then wait for three more, never overlapping findings.
- Deduplication is the service's job, before the scanner. The page seam records the same denied call twice plus one other, sees no finding, then sees one after a third distinct denial.
- Deletion checks (repeat ignored, overlap allowed, scanner given duplicates) each fail the suite.
