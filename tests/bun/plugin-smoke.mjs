// Ticket 95: the built plugin, under Bun as OpenCode runs it. Run after `npm run build`: `bun tests/bun/plugin-smoke.mjs`.
// Not a vitest suite: Bun has no node:sqlite, so this checks the plugin alone against a fake /hook.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { connect, createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const state = mkdtempSync(join(tmpdir(), "tracevault-bun-"));
// Read when PluginConfig is built, so the outbox and gap state land in the temporary folder.
process.env.LOCALAPPDATA = state;

const dist = new URL("../../dist/plugin/", import.meta.url);
const load = async (name) => (await import(new URL(`${name}.js`, dist).href))[name];
const [EventForwarder, PendingGapStore, PluginConfig, TraceVaultPlugin, Outbox, ShellProxies] = await Promise.all(
  ["EventForwarder", "PendingGapStore", "PluginConfig", "TraceVaultPlugin", "Outbox", "ShellProxies"].map(load),
);

const TIMEOUT_MS = 5000;
const SESSION = "ses_bun_smoke";

const received = [];
const arrivals = new EventEmitter();
const hook = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    received.push(JSON.parse(body));
    response.end("{}");
    arrivals.emit("payload");
  });
});

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address().port));
  });
}

function stop(server) {
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(() => resolve()));
}

function waitFor(found, what) {
  return new Promise((resolve, reject) => {
    const check = () => {
      const hit = received.find(found);
      if (hit !== undefined) {
        clearTimeout(timer);
        arrivals.off("payload", check);
        resolve(hit);
      }
    };
    const timer = setTimeout(() => {
      arrivals.off("payload", check);
      reject(new Error(`timed out waiting for ${what}`));
    }, TIMEOUT_MS);
    arrivals.on("payload", check);
    check();
  });
}

const upstream = createTcpServer((socket) => socket.end("pong"));

try {
  const hookPort = await listen(hook);
  const upstreamPort = await listen(upstream);
  const config = new PluginConfig(`http://127.0.0.1:${hookPort}/hook`);
  // The same wiring as the loader `init` writes, minus the MCP relay; an empty environment so a proxy set on this machine cannot turn the shell unwatched.
  const plugin = new TraceVaultPlugin(
    new EventForwarder(config),
    new PendingGapStore(config.gapStatePath),
    undefined,
    null,
    undefined,
    undefined,
    new ShellProxies({}),
    new Outbox(config.outboxDirectory),
  ).hooks();

  // 1. A bash call's connection, through the proxy shell.env points it at, reaches /hook as that call's.
  const output = { env: {} };
  await plugin["shell.env"]({ sessionID: SESSION, callID: "call_bash" }, output);
  const proxy = new URL(output.env.HTTPS_PROXY);
  assert.equal(proxy.hostname, "127.0.0.1", "shell.env set HTTPS_PROXY to a loopback proxy");
  const reply = await new Promise((resolve, reject) => {
    const socket = connect(Number(proxy.port), "127.0.0.1", () => socket.write(`CONNECT 127.0.0.1:${upstreamPort} HTTP/1.1\r\nHost: 127.0.0.1:${upstreamPort}\r\n\r\n`));
    let data = "";
    socket.on("data", (chunk) => (data += chunk));
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
    socket.setTimeout(TIMEOUT_MS, () => reject(new Error("timed out waiting for the tunnel")));
  });
  assert.match(reply, /^HTTP\/1\.1 200[\s\S]*pong$/, "the tunnel reached the upstream");
  const connection = await waitFor((payload) => payload.hook === "net.connect", "net.connect");
  assert.equal(connection.sessionID, SESSION);
  assert.equal(connection.callID, "call_bash");
  assert.equal(connection.host, "127.0.0.1");
  assert.equal(connection.port, upstreamPort);
  console.log("ok - a CONNECT through the shell proxy reached /hook as net.connect");

  // 2. With /hook down, a payload waits in an owner-only outbox file.
  await stop(hook);
  const after = (callID) => plugin["tool.execute.after"]({ tool: "read", sessionID: SESSION, callID, args: { filePath: `${callID}.ts` } }, {});
  await after("call_down");
  const outbox = config.outboxDirectory;
  const files = readdirSync(outbox);
  assert.equal(files.length, 1, "one outbox file");
  assert.equal(statSync(join(outbox, files[0])).mode & 0o777, 0o600, "the outbox file is owner-only");
  console.log("ok - with /hook down the payload went to an outbox file with mode 600");

  // 3. Once /hook is back, the next payload sends the waiting one first.
  await listen(hook, hookPort);
  await after("call_up");
  const calls = received.filter((payload) => payload.hook === "tool.execute.after").map((payload) => payload.input.callID);
  assert.deepEqual(calls, ["call_down", "call_up"], "the waiting payload arrived first");
  assert.deepEqual(readdirSync(outbox), [], "the outbox is empty");
  console.log("ok - once /hook was back the outbox was sent in order and emptied");
} finally {
  await Promise.all([stop(hook), stop(upstream)]);
  rmSync(state, { recursive: true, force: true });
}
