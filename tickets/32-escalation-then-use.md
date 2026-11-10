# 32 — Escalation then use (probe first)

**What to build:** `escalation-then-use` matches a permission grant followed shortly by a call that uses it. Phase 1 captures no grant events, so this ticket starts with a probe.

**Blocked by:** 28. Not on the Phase 2 exit path.

**Status:** probe complete; capture and rule pending approval of the event format

- [x] Probe: approve one `ask` permission in a live session, log every raw `event` hook type the plugin sees, and freeze what arrives in `docs/probes/`. Evidence is documented in `docs/probes/phase-2-live-probes.md`; raw permission events are frozen in `tests/fixtures/permission-grants.json`.
- [ ] If grant events arrive: capture them as `admin.grant` (Seam B), then add the rule, which binds the granted scope and matches a use of it inside the window (Seam C)
- [ ] If they never reach plugins: record that negative result in the probe doc and descope this rule family with Kevin's approval

**Technical notes:** Per AGENTS.md §3, an unknown hook shape is probed, recorded and frozen before any test is written against it. Do not guess the payload.

**Probe result (10 Nov 2026):** Kevin ran the interactive probe with DeepSeek and approved four calls once and a final `date` call always. Plugins received `permission.asked` and `permission.replied` with full properties. The reply joins to the asked request by `sessionID` and `requestID`/`id`. A once grant applies to `patterns`; an always grant uses the request's `always` list. The `admin.grant` event draft does not represent these scopes or distinguish once from always; approval for a revised event format is pending. No capture or scanner implementation has been added, and the ticket is not complete.

**Notes (7 Nov 2026):** The probe could not run on this machine. Free models hit their usage limit, no provider credentials are configured, and an unattended auto-approve run was refused by Claude Code's safety check. The installed plugin types declare a `permission.ask` hook and permission events in two different shapes, recorded in `docs/probes/phase-2-live-probes.md`. Which shape reaches a plugin must be observed, so nothing is captured yet. Run `sh docs/probes/scripts/permission-probe.sh <dir>` and approve the one prompt. Then capture `admin.grant` from the recorded shape and add the rule. Not on the Phase 2 exit path.
