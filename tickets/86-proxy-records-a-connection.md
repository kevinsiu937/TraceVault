# 86 — The proxy records a connection (tracer bullet)

**What to build:** `ShellProxy` (in `src/capture/`) is owned by one bash call: it opens on `127.0.0.1:0`, and for `CONNECT host:port` and for an absolute-URL request it forwards the bytes and hands over one `net.connect` (host, port, kind `https` or `http`, the owner's call id, whether the upstream opened). The plugin posts it to `/hook` as a new hook payload; the capture stage maps it to a `net.connect` event under capture path `proxy`, in the owner's session. It never stores a path, header or body. The timeline shows the connection nested under its bash call. The proxy uses `node:net` only, because that is what the 17 Nov probe proved under Bun. The proxy in the service (port + 1, `Proxy-Authorization`) is removed. The plugin's `shell.env` is ticket 87; here the demo is a test that opens a proxy for a call and sends `curl -x` style requests to it.

Spec: `docs/spec/shell-proxy.md` (revised 17 Nov 2026).

**Blocked by:** 65 (done, both probes).

**Status:** done (17 Nov 2026). The first build put the proxy in the service and attributed by `Proxy-Authorization`; it was reworked to the revised spec. Kevin's open question (where to store a connection that names no session) is gone: every connection arrives on a port that belongs to one call. Tests: `tests/seams/shell-proxy.seam.test.ts`.

- [x] A CONNECT and a plain request through a call's proxy reach a throwaway upstream on 127.0.0.1 byte for byte, and each is stored with host, port, kind, and the call's session and call id (Seam B, no network)
- [x] A request shaped like the 17 Nov probe's git request (CONNECT with no proxy credentials) is attributed to its call (Seam B)
- [x] One whose upstream refuses is stored as not opened
- [x] No path, header or body appears in the stored event
- [x] The session page nests the connection under its bash call, and the detail pane shows it (Seam A)
- [x] The service no longer opens a proxy port; `run` prints no proxy line
- [x] `tracevault verify` passes on a database with `net.connect` events
- [x] Typecheck, build and the full suite pass

**Follow-up (17 Nov 2026, review R2):** an already-open live page now nests a connection when its bash call completes; the stream re-sends a row whose parent changed, not only one whose flags changed (`tests/seams/live.seam.test.ts`).
