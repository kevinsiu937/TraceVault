# 86 — The proxy records a connection (tracer bullet)

**What to build:** `tracevault run` also listens on the service port plus one, as a forwarding proxy on 127.0.0.1. For `CONNECT host:port` and for an absolute-URL request, it forwards the bytes unchanged and appends one `net.connect` event: host, port, kind (`https` or `http`), call id, and whether the upstream connection opened. It takes the session and call from the `Proxy-Authorization` user name and password, and stores a connection without them under "unknown call". It never stores a path, header or body. The timeline shows the connection nested under its bash call. The plugin is not changed yet; the demo is `curl -x` by hand.

Spec: `docs/spec/shell-proxy.md`.

**Blocked by:** 65 (the header and the subagent session id decide the attribution).

**Status:** open

- [ ] A CONNECT and a plain request through the proxy reach a throwaway upstream on 127.0.0.1 byte for byte, and each is recorded with host, port, kind and attribution (no network)
- [ ] A request built from ticket 65's frozen fixture is attributed to its session and call (Seam B)
- [ ] A connection without attribution is stored under "unknown call"; one whose upstream refuses is stored as not opened
- [ ] No path, header or body appears in the stored event
- [ ] The session page nests the connection under its bash call, and the detail pane shows it (Seam A)
- [ ] The proxy port in use is refused with a clear message, and the service still starts
- [ ] `tracevault verify` passes on a database with `net.connect` events
- [ ] Typecheck, build and the full suite pass
