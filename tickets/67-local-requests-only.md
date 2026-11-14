# 67 — Only this machine's own pages and tools reach the service

**What to build:**
- The service listens on loopback, but a browser will post to `127.0.0.1` for any web site, and a site whose name is re-pointed at `127.0.0.1` can read the answers. Found on 15 Nov 2026 by a live run: a forged event posted with another site's `Origin` was stored, and a page asked for under another `Host` was served.
- Every request is checked before routing. The `Host` must be `127.0.0.1` or `localhost`, and an `Origin`, when a browser sends one, must be the service itself. Anything else gets 403 and nothing is stored.

**Blocked by:** none.

**Status:** done

- [x] A page asked for under another site's name is refused (Seam A)
- [x] An event posted by another site's page is refused and nothing is stored (Seam A)
- [x] The service's own pages still load under `localhost`, and a request its own page makes is served (Seam A)
- [x] Removing the check fails the first two tests
- [x] Live: the two forged requests get 403; a plugin-style post, the session list and the live stream still work
- [x] Typecheck, build and the full suite pass

**Technical notes:** there is no token. Another program run by the same user could read any token file, so a token would add nothing against it; a forged event from a local program stays possible and is a known limit. The plugin sends no `Origin`, which is why an absent one is allowed.
