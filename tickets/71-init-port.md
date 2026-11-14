# 71 — A service on another port still receives events

**What to build:** `init` writes port 4319 into the plugin. A user who starts the service with `run --port 5000`, because 4319 is taken, records nothing and sees no error. `init --port <n>` writes that port into the plugin, and `run` says which port installed plugins must use.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `init --port 5000` installs a plugin that posts to port 5000 (Seam B)
- [ ] `init` without `--port` still posts to 4319
- [ ] `run --port <n>` with n other than 4319 prints one line saying plugins must be installed with `init --port <n>`
- [ ] The exit-run script that patched the port with `sed` uses `--port`
- [ ] Typecheck, build and the full suite pass
