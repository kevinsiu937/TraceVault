# 95 — The plugin is tested under Bun in CI

**What to build:** OpenCode runs the plugin on Bun 1.3.x, but CI runs only Node, and the store-backed suites cannot run under Bun (no `node:sqlite`). A smoke script, run under `bun` in CI after the Node build, imports the built plugin from `dist/plugin/`, wires it as the loader `init` writes does, and proves on Bun what the seams prove on Node: a shell call's connection reaches `/hook`, and a payload the service cannot take waits in the outbox and is sent once it is back. Everything is on 127.0.0.1; waits are event-driven, with a timeout.

Script: `tests/bun/plugin-smoke.mjs`. It lives under `tests/` with the other checks, in its own folder because it is not a vitest suite and runs on the built output, not on `src/`.

**Blocked by:** none.

**Status:** built (17 Nov 2026); done when CI's Bun run passes. Bun is not installed on the build machine: the script passed there under Node 24; its first Bun run is CI's.

- [ ] Under `bun` (passes under Node locally; Bun proven by the first CI run), `shell.env` sets the proxy variables, a `CONNECT` through that port reaches a local upstream, and one `net.connect` with the call's `sessionID` and `callID` reaches a fake `/hook`
- [ ] With `/hook` down (same), the payload goes to an outbox file with permission 600 in the state folder (`LOCALAPPDATA` points it at a temporary folder); once `/hook` is back, the next payload sends it first, in order, and the outbox is empty
- [x] No external network, no fixed sleeps
- [x] CI installs Bun (pinned) and runs the script after the build
- [x] Typecheck, build and the full suite pass
