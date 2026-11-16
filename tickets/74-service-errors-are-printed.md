# 74 — The service says why a request failed

**What to build:** Any error while handling a request becomes a bare 500 and nothing is printed. A full disk or a locked database loses every event, and the only trace is a "service unavailable" gap. The service prints one line per failed request to its error output: the request path and the error.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] A request whose handling throws answers 500 and writes one line naming the path and the error (Seam A)
- [x] The line holds no request body
- [x] Typecheck, build and the full suite pass
