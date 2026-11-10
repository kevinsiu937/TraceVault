# 32 — Escalation then use (probe first)

**What to build:** `escalation-then-use` matches a permission grant followed shortly by a call that uses it. Phase 1 captures no grant events, so this ticket starts with a probe.

**Blocked by:** 28. Not on the Phase 2 exit path.

**Status:** done

- [x] Probe: approve one `ask` permission in a live session, log every raw `event` hook type the plugin sees, and freeze what arrives in `docs/probes/`. Evidence is documented in `docs/probes/phase-2-live-probes.md`; raw permission events are frozen in `tests/fixtures/permission-grants.json`.
- [x] If grant events arrive: capture them as `admin.grant` (Seam B), then add the rule, which binds the granted scope and matches a use of it inside the window (Seam C)
- [ ] ~~If they never reach plugins: record that negative result in the probe doc and descope this rule family with Kevin's approval~~ Not needed: they arrive.

**Technical notes:** Per AGENTS.md §3, an unknown hook shape is probed, recorded and frozen before any test is written against it. Do not guess the payload.

**Probe result (10 Nov 2026):** Kevin ran the interactive probe with DeepSeek and approved four calls once and a final `date` call always. Plugins received `permission.asked` and `permission.replied` with full properties. The reply joins to the asked request by `sessionID` and `requestID`/`id`. A once grant applies to `patterns`; an always grant uses the request's `always` list. The `admin.grant` event draft does not represent these scopes or distinguish once from always; approval for a revised event format is pending. No capture or scanner implementation has been added, and the ticket is not complete.

**Capture (10 Nov 2026):** Kevin approved the recorded format, without `grantor`, `expires_at` or `reviewed`, which OpenCode does not provide. An approved prompt is stored as `admin.grant` with `permission`, `patterns`, `reply` and the `call_id` of the call that raised it; a rejection stores nothing. `call_id` is kept so the rule can tell a later use of an `always` grant from the call the user just approved. Seam B replays the recorded fixture through the plugin. The rule matches `always` grants only, because a `once` approval covers nothing beyond the call shown. The first box stays open until the rule lands.

**Rule (11 Nov 2026):** `rules/escalation-then-use.yaml` starts on an `always` shell approval, binds its patterns and the approved call's id, and finishes on the first later shell command the patterns allow, other than the approved call. A refused command is not a use. Two operators were added: `allowed_by`, which matches a command against bound permission patterns, and `other_than`, which skips a bound value. Pattern matching copies OpenCode 1.18.32's `Wildcard.match`, read from the installed binary, and is pinned by a unit table in `tests/unit/PermissionPattern.test.ts`. A new fact, `call`, is a call's id, or the call a grant was raised for; the grant's `target` lists its patterns one per line. The call id in a permission request and the tool hooks' call id were not logged in the same run; both use OpenCode's tool-part call id format, and the rule assumes they are the same value. Window: the session, because an `always` approval lasts the session.

**Notes (7 Nov 2026):** The probe could not run on this machine. Free models hit their usage limit, no provider credentials are configured, and an unattended auto-approve run was refused by Claude Code's safety check. The installed plugin types declare a `permission.ask` hook and permission events in two different shapes, recorded in `docs/probes/phase-2-live-probes.md`. Which shape reaches a plugin must be observed, so nothing is captured yet. Run `sh docs/probes/scripts/permission-probe.sh <dir>` and approve the one prompt. Then capture `admin.grant` from the recorded shape and add the rule. Not on the Phase 2 exit path.
