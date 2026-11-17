# 65 — Probe: can a proxy tell which call made a connection?

**What to build:** The shell proxy (`docs/spec/shell-proxy.md`) attributes a connection to its session and bash call by putting them in the proxy address as user name and password, which clients send as a `Proxy-Authorization` header. Before anything is built, a probe records whether that works:
- which of `curl`, `git`, `pip`, `npm` and `python3` (urllib) use the proxy variables at all, and which send the header;
- what the `shell.env` hook receives for a subagent's bash call (its own session id, or the parent's).

The probe runs a throwaway logging proxy on 127.0.0.1 that answers every request itself and connects nowhere, so no traffic leaves the machine. Each program is asked for `http://tracevault-probe.invalid/` and `https://tracevault-probe.invalid/`.

Originally "A local proxy that records where the shell connects"; that work is now tickets 86 to 89.

**Blocked by:** 64 (done: `shell.env` reaches bash), spec approved (16 Nov 2026).

**Status:** done (16 Nov 2026)

**Result (16 Nov 2026, OpenCode 1.18.32, deepseek-flash, Kevin's run):**

| Program | Used the proxy | Sent session and call |
|---|---|---|
| curl, HTTP and HTTPS | yes | yes |
| pip | yes | yes |
| python3 urllib | yes | yes |
| git 2.50.1 | yes | no, not even after a 407 challenge |
| npm | not installed on Kevin's machine; untested | — |

- **Subagents:** a subagent's bash call gets the subagent's own session id in `shell.env`, the same id its `tool.execute.before` carries. A connection is therefore attributed to the session that ran the command, not to the parent.
- **git:** its connection is recorded, but under "unknown call". It still appears on the timeline and in the session's host list.

Frozen as `tests/fixtures/shell-proxy-probe.json`.

**Second probe, the revised design (17 Nov 2026, OpenCode 1.18.32, deepseek-flash, Kevin's run):** a plugin opened a `node:net` proxy on port 0 in `shell.env`, one per bash call.
- The plugin runtime is Bun 1.3.14, and the server opened in 4 ms per call.
- Every request arrived on the port of the call that made it: curl HTTP and HTTPS, git (`:4402`), python3 (`:4405`), and a background curl 3 s after its call returned. git is attributed by port without sending anything.
- The second call (`sleep 5`) got its own port and received nothing.

The spec was revised on this result (Kevin, 17 Nov 2026). Frozen as `tests/fixtures/shell-proxy-plugin-probe.json`.

Run:
`TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/shell-proxy-plugin-probe.sh /tmp/tv-proxy-plugin`

Run:
`TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/shell-proxy-probe.sh /tmp/tv-shell-proxy`

**Local check, without OpenCode (16 Nov 2026):** the script's proxy and clients were run by hand with fake ids in the proxy address. curl (HTTP and HTTPS), pip, npm and python3 urllib sent the ids. git 2.50.1 sent none, even after a 407 challenge. The live run decides; if git still sends none, its connections are recorded under "unknown call".

- [x] `docs/probes/scripts/shell-proxy-probe.sh` written; it passes the probe-safety seam
- [x] Kevin ran it, and the result is recorded here: per program, whether it used the proxy and whether it sent the header; the session id a subagent's call gets
- [x] The recorded proxy requests are frozen as a fixture for ticket 86
- [x] The spec's blind spots name every program that ignored the proxy or dropped the header
