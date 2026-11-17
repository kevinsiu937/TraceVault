# 87 — The plugin opens a proxy for each bash call

**What to build:** In the `shell.env` hook, the plugin opens a `ShellProxy` for the call (ticket 86) and sets `HTTPS_PROXY`, `HTTP_PROXY`, `https_proxy` and `http_proxy` to `http://127.0.0.1:<its port>`, and adds `localhost,127.0.0.1,::1` to `NO_PROXY` and `no_proxy`. The port stays open until OpenCode exits, so a background process keeps its call. When a proxy variable is already set, the plugin leaves every variable alone and records a `capture.gap` saying the shell was not watched. When the port cannot be opened, it sets nothing and records the same gap. The TraceVault service being down does not change what the hook does.

Spec: `docs/spec/shell-proxy.md` (revised 17 Nov 2026), "Never block".

**Blocked by:** 86.

**Status:** built; waiting on Kevin's live run (17 Nov 2026). Tests: `tests/seams/shell-proxy.seam.test.ts`.

- [x] A bash call's `shell.env` gets proxy variables pointing at its own port, and a connection on that port is stored under that call (Seam B)
- [x] Two calls get two ports, each attributed to its own call (Seam B)
- [x] An existing `HTTPS_PROXY` is left unchanged, and the session page says the shell was not watched (Seam B, Seam A)
- [x] With the service down, the hook still sets the variables and the shell's connections still go through
- [ ] Kevin's live run: a session where the agent runs `curl` and `git ls-remote` shows both connections under their calls
- [x] Typecheck, build and the full suite pass
