# Spec: where the agent's shell connects (ticket 65)

> Status: **approved 16 Nov 2026.** Binding until superseded.
> Kevin decided on 16 Nov 2026:
> - build the proxy; it records and never blocks; when the service is not running, the shell connects directly, as if TraceVault were not installed;
> - the proxy listens on the service port plus one (4320 by default);
> - build `new-host`, last, so it can be dropped if it proves noisy;
> - when a proxy variable is already set, leave it and say the shell was not watched.
> Tickets: `tickets/65-*` and `tickets/86-*` to `tickets/89-*`.
> Builds on ticket 64 (`docs/spec/evasion-before-phase-5.md`): its probe showed that variables a plugin sets in OpenCode's `shell.env` hook reach the bash tool (15 Nov 2026, OpenCode 1.18.32).

## Problem Statement

TraceVault finds data leaving the machine by reading the command: a program on the `network-programs` list (`curl`, `ssh`, `dig`…). A command whose effect cannot be read from it, such as a computed program name, decoded code piped to `sh`, or a Python script that opens a connection, is flagged as opaque. TraceVault still cannot say where it connected. The command text is the only evidence, and it can be written to hide its intent.

## Solution

The plugin points the shell's `HTTPS_PROXY` and `HTTP_PROXY` at a small proxy inside the TraceVault service, on 127.0.0.1. The proxy forwards every connection unchanged and records, for each one, the host and port it went to. Encrypted traffic stays encrypted: for HTTPS the proxy sees only the host name the client asks it to connect to, never the content. Each connection becomes an event on the session's timeline, next to the bash call that made it, and the rules can use it.

The command can be written any way; if the program it ends up running honours the proxy variables, the destination is recorded.

## User Stories

1. As a developer, I want to see which hosts the agent's shell connected to during a session, so that a hidden download or upload is visible even when its command is unreadable.
2. As a developer, I want each connection shown under the bash call that made it, so that I know which command connected where.
3. As a developer, I want a secret read followed by a connection to any host flagged, so that exfiltration through an unlisted program is found.
4. As a developer, I want the agent's shell to keep working when the TraceVault service is not running, so that TraceVault never stops my work.
5. As a developer, I want the report to list the hosts a session connected to.
6. As a developer, I want to know plainly which connections TraceVault cannot see.

## Implementation Decisions

**Where the proxy runs.** Inside `tracevault run`, on a second loopback port. It is its own class and does not share the dashboard server's request handler, so the two do not have to tell a proxy request from a page request. It handles `CONNECT host:port` (HTTPS) and absolute-URL requests (plain HTTP). It forwards the bytes and records only the host and port, never a path, header or body: a URL path can carry the data being sent.

**Which session and call.** A connection carries no session id. The `shell.env` hook's input has `sessionID` and `callID`, so the plugin puts them in the proxy address as its user name and password: `http://<session>:<call>@127.0.0.1:<port>`. Clients send these as a `Proxy-Authorization` header. The proxy reads them to attribute the connection and accepts any value; it is not authentication. A connection that arrives without them is recorded under an "unknown call" row. Whether `curl`, `git`, `pip`, `npm` and `python3` send the header is settled by a probe (first ticket below).

**Never block.** The plugin sets the proxy variables for a bash call only when its last delivery to the service succeeded and a short health check (under 100 ms) answers. Otherwise it sets nothing, the call connects directly, and the plugin records a `capture.gap` saying the shell was not watched. If the service stops in the middle of a call, that call's connections fail; this is the one remaining way the proxy can stop work, and it is written down as a blind spot. When a proxy variable is already set (a company proxy, say), the plugin leaves it alone and the session page says the shell was not watched.

**Local traffic.** `NO_PROXY` gets `localhost,127.0.0.1,::1` added, so local development servers and TraceVault itself are reached directly.

**What is recorded.** One new event type, `net.connect`, with: host, port, kind (`https` for CONNECT, `http` for a plain request), the call id, and whether the upstream connection opened. It is appended through the same store and hash chain as every other event, under a new capture path, `proxy`. Nothing else about the connection is stored.

**Display.** A `net.connect` row nests under its bash call on the timeline, says "connected to host:port", and opens in the detail pane. The file rail is unchanged. The report gets a "Hosts contacted" list.

**Rules.**
- `exfiltration-chain` v3 accepts a `net.connect` as its egress step, so a sensitive read followed by a recorded connection is found whatever the command looked like.
- `new-host` flags the first connection of a session to a host that is not on a list of known hosts (`rules/lists/known-hosts.yaml`: package registries and code hosts).

## Testing Decisions

- **Seam B:** a `net.connect` arrives through the real capture path and is stored with the session and call it was attributed to; one without attribution is stored under "unknown call".
- **Seam A:** the timeline nests the connection under its bash call; the report lists the host.
- **Seam C:** trigger and clean fixtures for `exfiltration-chain` v3 and `new-host`.
- **The proxy itself:** a test starts the proxy on port 0 and a throwaway upstream server on 127.0.0.1, sends a CONNECT and a plain request with `curl`-style headers, and asserts the bytes arrive unchanged and the recorded host, port and attribution. No network.
- **Never block:** with the service stopped, the plugin's `shell.env` hook sets no proxy variable and records a gap (Seam B with a refused port).
- **Live (Kevin):** a probe (first ticket) and a live run that freezes a session with recorded connections.

## Proposed tickets

| # | Ticket | Blocked by |
|---|---|---|
| 65 | Probe: which programs send the proxy user name, and what `shell.env` gets for a subagent's call | spec approved |
| 86 | The proxy records a connection (tracer bullet: proxy, `net.connect`, timeline row, no plugin change) | 65 |
| 87 | The plugin points the shell at the proxy, only when the service answers | 86 |
| 88 | Exfiltration through any program: `exfiltration-chain` v3, and "Hosts contacted" in the report | 86 |
| 89 | `new-host`: the first connection to a host not on the known list | 88 |

## Out of Scope

- Blocking or refusing a connection.
- Reading encrypted traffic, or storing any path, header or body.
- Connections not made through the bash tool (OpenCode's own `webfetch` is already recorded as a tool call; MCP servers run outside the shell).
- A proxy for other agents (Phase 5).

## Known Blind Spots

- **Programs that drop the session and call** (ticket 65 probe, 16 Nov 2026): git 2.50.1 uses the proxy but never sends them, even after a 407 challenge, so its connections are recorded under "unknown call". curl, pip and python3 urllib send them. npm was not installed on the probe machine and is untested.
- **Programs that ignore proxy variables** are invisible: `nc`, `ssh`, raw sockets, DNS lookups (`dig` sends DNS, not HTTP), and some language runtimes. Node's built-in `fetch` ignores them by default, for example. These stay with the command-text rules.
- **A command can unset the variables** (`env -u HTTPS_PROXY curl …`, `curl --noproxy '*'`). The command-text rules still see the program; the proxy does not see the connection.
- **The service stopping mid-call** makes that call's connections fail, which is the only way this feature can stop work.
- **Host names only:** a connection to a trusted host (a code host, a paste service) can still carry data out, and the proxy cannot tell.
- **An existing proxy variable** means the shell is not watched for that session.

## Decisions (Kevin, 16 Nov 2026)

1. **The second port** is the service port plus one (4320 by default), so `init --port` keeps setting both.
2. **`new-host` is built, last.** It fires on the first connection to every unlisted host and may be noisy (a `pip install` from a new mirror), so it is the last ticket and can be dropped without touching the others.
3. **An existing proxy variable** is left alone, and the session page says the shell was not watched. Chaining through a company proxy is more code and more ways to break the user's network.
