# 96 — TraceVault installs from a package

**What to build:** Today TraceVault runs only from a clone. `npm pack` builds and produces a tarball that installs and runs on its own: `npm install -g ./tracevault-0.1.0.tgz`, then `tracevault init`, `run` and `verify` work, and the plugin `init` writes points into the installed package, not a clone. The package stays `"private": true`, so it cannot be published by accident; Kevin decides when it goes public.

Script: `tests/package/install-smoke.mjs`, run by CI after the Bun check. It packs, installs the tarball into a temporary prefix, and drives the installed `tracevault`.

**Blocked by:** 95.

**Status:** done (17 Nov 2026).

- [x] `npm pack` builds first and ships `dist/`, `rules/` and the README; `"private": true` stays
- [x] The installed `tracevault --version` prints the version
- [x] The installed `init --dir <project> --no-harden` writes a loader that imports from the installed package and loads
- [x] The installed `run` takes one hook payload, and `verify` passes on its database
- [x] CI runs the script
- [x] README describes installing from the tarball, and keeps the clone path
- [x] Typecheck, build and the full suite pass
