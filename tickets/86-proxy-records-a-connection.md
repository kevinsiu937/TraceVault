# 86 — The proxy records a connection (tracer bullet)

**What to build:** `tracevault run` also listens on the service port plus one, as a forwarding proxy on 127.0.0.1. For `CONNECT host:port` and for an absolute-URL request, it forwards the bytes unchanged and appends one `net.connect` event: host, port, kind (`https` or `http`), call id, and whether the upstream connection opened. It takes the session and call from the `Proxy-Authorization` user name and password, and stores a connection without them under "unknown call". It never stores a path, header or body. The timeline shows the connection nested under its bash call. The plugin is not changed yet; the demo is `curl -x` by hand.

Spec: `docs/spec/shell-proxy.md`.

**Blocked by:** 65 (the header and the subagent session id decide the attribution).

**Status:** in progress (16 Nov 2026). Everything below is built except storing a connection that names no session, which waits on Kevin (question below).

**Question for Kevin (16 Nov 2026):** a connection with no `Proxy-Authorization` (git's) carries no session id, and every event belongs to a session. The spec says it is stored "under unknown call", and ticket 65 says it appears "in the session's host list", but nothing says which session. Today such a connection is forwarded and not recorded. Options:
1. **A reserved session** (for example "connections with no session"). Simple and honest, but it is the pseudo-session that ticket 85 avoided: the session list, the report and the scale queries would each have to treat it specially.
2. **The session whose bash call is running.** Needs the plugin to tell the service when a call starts (ticket 87 territory), and is a guess when two sessions run bash at once; the row would say "probable".
3. **A table outside the chain**, like `mcp_trust`, listed on the session list page. Not on any timeline.

A connection that names the session but no call is stored in that session with `call_id: null`, shown as its own row.

- [x] A CONNECT and a plain request through the proxy reach a throwaway upstream on 127.0.0.1 byte for byte, and each is recorded with host, port, kind and attribution (no network)
- [x] A request built from ticket 65's frozen fixture is attributed to its session and call (Seam B)
- [ ] A connection without attribution is stored under "unknown call" (waiting on Kevin: see the question above); one whose upstream refuses is stored as not opened (done)
- [x] No path, header or body appears in the stored event
- [x] The session page nests the connection under its bash call, and the detail pane shows it (Seam A)
- [x] The proxy port in use is refused with a clear message, and the service still starts
- [x] `tracevault verify` passes on a database with `net.connect` events
- [x] Typecheck, build and the full suite pass
