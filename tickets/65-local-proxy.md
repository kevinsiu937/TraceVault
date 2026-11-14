# 65 — A local proxy that records where the shell connects

**What to build:** if ticket 64's probe shows the bash tool inherits `shell.env` variables, the plugin points `HTTPS_PROXY` and `HTTP_PROXY` at a TraceVault proxy on 127.0.0.1. The proxy records each connection's host, without opening encrypted traffic, and a rule flags a host the session has not used before. Tools that ignore proxy variables (`nc`, raw sockets) stay invisible to it.

**Blocked by:** 64 (waiting on the probe).

**Status:** unblocked: ticket 64's probe showed `shell.env` reaches bash (15 Nov 2026). Waiting on Kevin's go

- [ ] Spec section written once the probe answers
