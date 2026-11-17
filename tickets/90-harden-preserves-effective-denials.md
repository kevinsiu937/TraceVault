# 90 — Hardening never allows an operation the user denied

**What to build:** Running harden, or installing TraceVault with its default hardening, preserves every effective deny from the original top-level permissions while tightening permissive settings. Catch-all and broader deny patterns remain effective. Undo still restores the original configuration byte for byte.

**Blocked by:** None. Follow-up to completed tickets 54 and 68.

**Status:** done

**Priority:** P1.

**Evidence:** The focused thermo review reproduced a read catch-all deny becoming allow for the example environment file and ask for a secret environment file. A bash catch-all deny became ask. An overall permission catch-all deny and a broader environment-file deny also lost their effective restrictions. Existing handling preserves only some exact deny entries, which does not preserve the resolved policy.

**Demo:** Harden a project with broad denies and compare its effective permissions before and after. Previously denied operations remain denied through both harden and the default install flow. A permissive project still gains the intended questions before risky operations.

- [x] Write and run a failing regression at the existing harden/install integration seam before implementing the fix.
- [x] Preserve effective denies from an overall catch-all, a permission-specific catch-all, overlapping broader patterns and exact patterns. Include an explicitly allowed exception after a broad deny so rule ordering is respected rather than replacing the policy with blanket refusal.
- [x] An originally denied example environment file never becomes allowed through the example-file exception. Unrestricted example-file reads retain their intended behavior.
- [x] Exercise both the harden CLI and default init flow through their real assembly. Show persisted configuration decisions rather than calls to internal helpers.
- [x] Repeating harden remains idempotent, permissive configurations are still tightened, and undo restores the original bytes.
- [x] Keep agent-specific permissions unchanged and continue reporting their remaining risks.
- [x] Preserve stage boundaries and constructor-injected collaborators. If a new file structure is needed, present that design decision before implementation.
- [x] Typecheck, build and the full suite pass locally.

**Scope:** Fix permission preservation only. No new permission system, blocking mode or phase work.

**Follow-up (17 Nov 2026, review R1):** a narrow deny inherited through the overall permission, `{"*":{"rm *":"deny"}}`, raised the generated bash, webfetch, external_directory and doom_loop catch-alls to deny, so `ls` was refused instead of asked. The hardener now keeps every pattern that reaches a key, from its own entry or a wildcard permission, as its own entry after the catch-all. Only a user catch-all can raise the catch-all now. Seam tests cover harden and init: `rm -rf x` stays deny, `ls` asks. Still open: the appended edit and read patterns are raised to deny by any overlapping narrower user deny, for example `*.env*` raising `*.pem` and `rm *` raising `*AGENTS.md`. That only tightens, so it was left alone.
