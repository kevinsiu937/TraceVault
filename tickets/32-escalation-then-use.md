# 32 — Escalation then use (probe first)

**What to build:** `escalation-then-use` matches a permission grant followed shortly by a call that uses it. Phase 1 captures no grant events, so this ticket starts with a probe.

**Blocked by:** 28. Not on the Phase 2 exit path.

**Status:** blocked on a live probe that needs model access (see notes)

- [ ] Probe: approve one `ask` permission in a live session, log every raw `event` hook type the plugin sees, and freeze what arrives in `docs/probes/`
- [ ] If grant events arrive: capture them as `admin.grant` (Seam B), then add the rule, which binds the granted scope and matches a use of it inside the window (Seam C)
- [ ] If they never reach plugins: record that negative result in the probe doc and descope this rule family with Kevin's approval

**Technical notes:** Per AGENTS.md §3, an unknown hook shape is probed, recorded and frozen before any test is written against it. Do not guess the payload.

**Notes (7 Nov 2026):** The probe could not run on this machine. Free models hit their usage limit, no provider credentials are configured, and an unattended auto-approve run was refused by Claude Code's safety check. The installed plugin types declare a `permission.ask` hook and permission events in two different shapes, recorded in `docs/probes/phase-2-live-probes.md`. Which shape reaches a plugin must be observed, so nothing is captured yet. Run `sh docs/probes/scripts/permission-probe.sh <dir>` and approve the one prompt. Then capture `admin.grant` from the recorded shape and add the rule. Not on the Phase 2 exit path.
