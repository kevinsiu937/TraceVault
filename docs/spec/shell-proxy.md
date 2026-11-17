# Spec: where the agent's shell connects (ticket 65)

> Status: **approved 16 Nov 2026; revised 17 Nov 2026.** Binding until superseded.
> Kevin decided on 16 Nov 2026:
> - build the proxy; it records and never blocks;
> - build `new-host`, last, so it can be dropped if it proves noisy;
> - when a proxy variable is already set, leave it and say the shell was not watched.
>
> Kevin approved the revision on 17 Nov 2026: the proxy moves from the service into the plugin, with one port per bash call. The first design (a proxy in the service on port + 1, attributing by `Proxy-Authorization`) lost git's connections and could stop the shell when the service was down.
> Tickets: `tickets/65-*` and `tickets/86-*` to `tickets/89-*`.
> Builds on ticket 64 (`docs/spec/evasion-before-phase-5.md`): its probe showed that variables a plugin sets in OpenCode's `shell.env` hook reach the bash tool (15 Nov 2026, OpenCode 1.18.32).

## Problem Statement

TraceVault finds data leaving the machine by reading the command: a program on the `network-programs` list (`curl`, `ssh`, `dig`…). A command whose effect cannot be read from it, such as a computed program name, decoded code piped to `sh`, or a Python script that opens a connection, is flagged as opaque. TraceVault still cannot say where it connected. The command text is the only evidence, and it can be written to hide its intent.

## Solution

For each bash call, the plugin opens a small forwarding proxy on 127.0.0.1, on a port the operating system picks, and points that call's `HTTPS_PROXY` and `HTTP_PROXY` at it. The port belongs to that one call, so every connection that arrives on it is attributed to that call's session and call id. The proxy forwards every connection unchanged and records, for each one, the host and port it went to. Encrypted traffic stays encrypted: for HTTPS the proxy sees only the host name the client asks it to connect to, never the content. Each connection becomes an event on the session's timeline, next to the bash call that made it, and the rules can use it.

The command can be written any way; if the program it ends up running honours the proxy variables, the destination is recorded.

## User Stories

1. As a developer, I want to see which hosts the agent's shell connected to during a session, so that a hidden download or upload is visible even when its command is unreadable.
2. As a developer, I want each connection shown under the bash call that made it, so that I know which command connected where.
3. As a developer, I want a secret read followed by a connection to any host flagged, so that exfiltration through an unlisted program is found.
4. As a developer, I want the agent's shell to keep working when the TraceVault service is not running, so that TraceVault never stops my work.
5. As a developer, I want the report to list the hosts a session connected to.
6. As a developer, I want to know plainly which connections TraceVault cannot see.

## Implementation Decisions

**Where the proxy runs.** Inside the plugin, in OpenCode's own process, which runs plugins on Bun. The `shell.env` hook opens one proxy per bash call on `127.0.0.1:0` and sets the call's proxy variables to `http://127.0.0.1:<port>`. The proxy class (`ShellProxy`) stays in `src/capture/`; the plugin starts it. It is written on `node:net` only: the probe (17 Nov 2026) proved a `node:net` server works in a Bun plugin, and nothing proved `node:http`'s `connect` event there. It handles `CONNECT host:port` (HTTPS) and absolute-URL requests (plain HTTP). It forwards the bytes and records only the host and port, never a path, header or body: a URL path can carry the data being sent.

**Which session and call.** The port. `shell.env` receives `sessionID` and `callID`; the proxy opened for that call records every connection with them. No credentials are put in the proxy address, so a program that drops them (git) is still attributed. A subagent's bash call gets the subagent's own session id (ticket 65).

**How long a port stays open.** Until OpenCode exits, so a background process started by a call keeps its attribution after the call returns (the probe's `background` request arrived on its call's port 3 s after the call ended). Each bash call costs one listening socket.

**Never block.** The proxy lives in the same process as the shell's parent, so it is up whenever bash runs; the TraceVault service being down does not affect it. Its `net.connect` events go through the plugin's normal delivery: when the service is down they are lost and a `capture.gap` is recorded, as for every other event. When a port cannot be opened, the hook sets nothing, the call connects directly, and a `capture.gap` says the shell was not watched. When a proxy variable is already set (a company proxy, say), the plugin leaves it alone and a `capture.gap` says the shell was not watched.

**Local traffic.** `NO_PROXY` gets `localhost,127.0.0.1,::1` added, so local development servers and TraceVault itself are reached directly.

**What is recorded.** One event type, `net.connect`, with: host, port, kind (`https` for CONNECT, `http` for a plain request), the call id, and whether the upstream connection opened. The plugin posts it to `/hook` like every other hook payload; the capture stage maps it, under capture path `proxy`, and it is appended through the same store and hash chain as every other event. Nothing else about the connection is stored.

**Display.** A `net.connect` row nests under its bash call on the timeline, says "connected to host:port", and opens in the detail pane. The file rail is unchanged. The report gets a "Hosts contacted" list.

**Rules.**
- `exfiltration-chain` v3 accepts a `net.connect` as its egress step, so a sensitive read followed by a recorded connection is found whatever the command looked like.
- `new-host` flags the first connection of a session to a host that is not on a list of known hosts (`rules/lists/known-hosts.yaml`: package registries and code hosts).

## Testing Decisions

- **Seam B:** the plugin's `shell.env` hook sets the proxy variables to a port; a CONNECT and a plain request sent to that port reach a throwaway upstream on 127.0.0.1 byte for byte, and the `net.connect` posted to `/hook` is stored with that call's session and call id. No network. The suite runs under Node; Bun is covered by the probe and Kevin's live run.
- **Seam B:** two calls get two ports, and a connection on each is attributed to its own call.
- **Seam B:** an existing proxy variable is left unchanged and a gap is recorded.
- **Seam A:** the timeline nests the connection under its bash call; the report lists the host.
- **Seam C:** trigger and clean fixtures for `exfiltration-chain` v3 and `new-host`.
- **Live (Kevin):** the probes (tickets 65 and the 17 Nov plugin probe) and a live run that freezes a session with recorded connections.

## Proposed tickets

| # | Ticket | Blocked by |
|---|---|---|
| 65 | Probe: which programs use the proxy, and what `shell.env` gets for a subagent's call; then whether a Bun plugin can run the proxy | spec approved |
| 86 | The proxy records a connection (tracer bullet: proxy owned by one call, `net.connect` through `/hook`, timeline row) | 65 |
| 87 | The plugin opens a proxy for each bash call | 86 |
| 88 | Exfiltration through any program: `exfiltration-chain` v3, and "Hosts contacted" in the report | 86 |
| 89 | `new-host`: the first connection to a host not on the known list | 88 |

## Out of Scope

- Blocking or refusing a connection.
- Reading encrypted traffic, or storing any path, header or body.
- Connections not made through the bash tool (OpenCode's own `webfetch` is already recorded as a tool call; MCP servers run outside the shell).
- A proxy for other agents (Phase 5).

## Known Blind Spots

- **Programs that ignore proxy variables** are invisible: `nc`, `ssh`, raw sockets, DNS lookups (`dig` sends DNS, not HTTP), and some language runtimes. Node's built-in `fetch` ignores them by default, for example. These stay with the command-text rules. npm was not installed on the probe machine and is untested.
- **A command can unset the variables** (`env -u HTTPS_PROXY curl …`, `curl --noproxy '*'`). The command-text rules still see the program; the proxy does not see the connection.
- **A process that outlives OpenCode** loses its proxy: its later connections are refused. This is the one way this feature can stop work.
- **The service being down** loses the connections made meanwhile, as it loses every other event; a gap records it.
- **Host names only:** a connection to a trusted host (a code host, a paste service) can still carry data out, and the proxy cannot tell.
- **An existing proxy variable** means the shell is not watched for that call.
- **One listening socket per bash call**, held until OpenCode exits.

## Decisions (Kevin)

1. **Ports** (revised 17 Nov 2026): one per bash call, picked by the operating system. Replaces "the service port plus one".
2. **`new-host` is built, last** (16 Nov 2026). It fires on the first connection to every unlisted host and may be noisy (a `pip install` from a new mirror), so it is the last ticket and can be dropped without touching the others.
3. **An existing proxy variable** is left alone, and the session page says the shell was not watched (16 Nov 2026). Chaining through a company proxy is more code and more ways to break the user's network.
