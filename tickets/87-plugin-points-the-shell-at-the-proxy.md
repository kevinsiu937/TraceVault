# 87 — The plugin points the shell at the proxy, only when the service answers

**What to build:** In the `shell.env` hook, the plugin sets `HTTPS_PROXY` and `HTTP_PROXY` to `http://<session>:<call>@127.0.0.1:<service port + 1>` and adds `localhost,127.0.0.1,::1` to `NO_PROXY`, but only when its last delivery to the service succeeded and a health check answers within 100 ms. Otherwise it sets nothing, the call connects directly, and a `capture.gap` says the shell was not watched. When a proxy variable is already set, the plugin leaves it, and the session page says the shell was not watched. `init --port` writes both ports.

Spec: `docs/spec/shell-proxy.md`, "Never block".

**Blocked by:** 86.

**Status:** open

- [ ] With the service up, a bash call's `shell.env` gets the proxy variables carrying its session and call (Seam B)
- [ ] With the service down, the hook sets no proxy variable, answers within the time limit, and a gap is recorded once the service is back (Seam B)
- [ ] An existing `HTTPS_PROXY` is left unchanged, and the session page says the shell was not watched (Seam B, Seam A)
- [ ] `init --port 5000` makes the plugin use 5001 for the proxy
- [ ] Kevin's live run: a session where the agent runs `curl` shows the connection under the call
- [ ] Typecheck, build and the full suite pass
