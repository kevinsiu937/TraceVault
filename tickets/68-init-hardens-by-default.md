# 68 — `init` hardens the project unless told not to

**What to build:**
- TraceVault is for solo developers who will not read findings before something goes wrong, so prevention has to be the default. `tracevault init` now also does what `tracevault harden` does. `--no-harden` leaves `opencode.json` alone.
- `tracevault uninstall` also puts back what harden changed, so one command still restores the project.

**Blocked by:** 54. Decided by Kevin on 15 Nov 2026.

**Status:** done

- [x] `init` on a permissive `opencode.json` makes shell calls ask, and `uninstall` restores the project byte for byte (Seam B, through the CLI)
- [x] `init --no-harden` installs the plugin and leaves `opencode.json` untouched (Seam B)
- [x] A configuration harden refuses (`opencode.jsonc`, comments) does not stop the install; the output says "not hardened" and why (Seam B)
- [x] Running `init` twice and then `uninstall` removes the plugin. Before, the second run recorded TraceVault's own loader as the original, so uninstall put it back; found by the live check (Seam B)
- [x] Live: init, init again, uninstall on a scratch project leaves only the original `opencode.json`
- [x] Typecheck, build and the full suite pass

**Technical notes:**
- `InitCommand` and `UninstallCommand` take an optional `HardenCommand`; the CLI passes it. Without one they behave as before.
- `uninstall` undoes harden whenever an original is saved, also when the user ran `tracevault harden` by hand. A project where only `harden` was run, without `init`, is left alone.
- `phase-3-exit-run.sh` installs with `--no-harden`, because it records a deliberately misconfigured project.
