# 75 — A freeze late in a long prompt is still seen

**What to build:** The plugin keeps the first 200 characters of a prompt, so "do not delete anything" at character 300 never reaches the `destructive-action` rule. The plugin keeps far more (a few thousand characters), the rule reads all of it, and the timeline still shows a short line.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A prompt with a freeze phrase after character 200, then a deletion, raises `destructive-action` (Seam B through Seam C)
- [ ] The timeline row for a long prompt is still cut to its readable length
- [ ] A prompt past the new limit is still marked truncated
- [ ] The blind-spot notes in `docs/spec/phase-2.md` and the rule file give the new limit
- [ ] Typecheck, build and the full suite pass
