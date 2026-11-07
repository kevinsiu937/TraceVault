# 32 — Escalation then use (probe first)

**What to build:** `escalation-then-use` matches a permission grant followed shortly by a call that uses it. Phase 1 captures no grant events, so this ticket starts with a probe.

**Blocked by:** 28. Not on the Phase 2 exit path.

**Status:** blocked (see Blocked by)

- [ ] Probe: approve one `ask` permission in a live session, log every raw `event` hook type the plugin sees, and freeze what arrives in `docs/probes/`
- [ ] If grant events arrive: capture them as `admin.grant` (Seam B), then add the rule, which binds the granted scope and matches a use of it inside the window (Seam C)
- [ ] If they never reach plugins: record that negative result in the probe doc and descope this rule family with Kevin's approval

**Technical notes:** Per AGENTS.md §3, an unknown hook shape is probed, recorded and frozen before any test is written against it. Do not guess the payload.
