# 54 — Harden: let OpenCode's own permissions do the blocking

**What to build:** TraceVault records and flags; it does not prevent. `tracevault harden [--dir <path>]` tightens the project's own `opencode.json` so OpenCode itself asks before risky calls, then re-checks the result with the Phase 3 static rules and lists what is still risky. `--undo` puts the original bytes back.

**Blocked by:** 43. Hardening follow-up Kevin asked for on 13 Nov 2026, before Phase 5.

**Status:** done

- [x] A permissive configuration (shell, edit, web fetch, outside folders and repeated calls allowed, `.env` reads allowed, `git *` allowed, a trailing `"*": "allow"`) raises no static finding after harden (Seam B, through the CLI)
- [x] Values the user set to "deny" stay, and keys outside the top-level `permission` block (`$schema`, `mcp`, `agent`) are untouched
- [x] An agent's own risky permissions are left alone and named in the output as still risky, with their configuration entry
- [x] The native `plan` agent still may not edit files after harden; edits to the agent's own configuration ask; `.env.example` reads stay allowed
- [x] With no `opencode.json`, harden creates one and undo removes it
- [x] Undo restores the original bytes exactly, also after hardening twice
- [x] A file with comments, an `opencode.jsonc` or a non-object makes harden refuse and change nothing
- [x] Undo without a prior harden fails with a clear message
- [x] Typecheck, build and the full suite pass

**Technical notes:** The policy lives in `ConfigHardener` (`src/scanner/static/`), a pure class; `HardenCommand` (`src/cli/`) reads and writes the file and re-checks with the static rules. The original is kept in `.opencode/.tracevault-harden.json`, written with `InstallManifest`. See `docs/spec/phase-3.md`, "Follow-up: harden".
