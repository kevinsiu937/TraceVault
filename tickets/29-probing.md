# 29 — Probing: repeated denied calls

**What to build:** `probing` matches three or more denied calls inside the window. A denial is the stored `denied` outcome, not a plain error. All the denied rows carry the flag.

**Blocked by:** 28.

**Status:** blocked (see Blocked by)

- [ ] Three denied calls inside the window flag all three rows with one finding
- [ ] Two denials, or three plain errors, produce no finding
- [ ] The same denied call seen by both the live hook and the history import counts once
- [ ] Seam C trigger and clean fixtures; the trigger comes from a real `opencode run` session whose `ask` calls are auto-rejected

**Technical notes:** The repeat count is a step property in the rule file, not a special rule kind. Counting runs over the deduplicated timeline, the same one the page renders.
