# 71 — A service on another port still receives events

**What to build:** `init` writes port 4319 into the plugin. A user who starts the service with `run --port 5000`, because 4319 is taken, records nothing and sees no error. `init --port <n>` writes that port into the plugin and prints the `run` command that matches it.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] `init --port 5000` installs a plugin that posts to port 5000 (Seam B)
- [x] `init` without `--port` still posts to 4319
- [x] `init --port <n>` prints the matching `tracevault run --port <n>` line
- [x] The exit-run script that patched the port with `sed` uses `--port`
- [x] Typecheck, build and the full suite pass

**Technical notes:** The hint is printed by `init`, not by `run` as first written: `run` cannot know which projects were installed with which port, and `init` is where the choice is made. A project already installed on 4319 needs `uninstall` then `init --port <n>` to move.
