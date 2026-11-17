#!/bin/sh
# Shell proxy, revised design: can the proxy live inside the OpenCode plugin,
# with one listening port per bash call? The plugin runtime is Bun, not Node,
# so this probe checks that a plugin can open a TCP server with node:net from
# the shell.env hook, point that call's HTTPS_PROXY and HTTP_PROXY at it, and
# see the requests: from curl, git (which sends no proxy credentials) and
# python3, and from a background curl that runs after its bash call returned.
# Attribution is by port: each port belongs to the one call that opened it.
#
# Safety: each per-call proxy answers every request itself (403 for CONNECT,
# 404 otherwise) and connects nowhere. Every URL names tracevault-probe.invalid,
# a reserved name that never resolves. The only commands allowed are
# `sh clients.sh main` and `sleep 5`; edits, web fetch and folders outside the
# workspace are denied. The log keeps the request line (method and target),
# the port and the call it belongs to: no header, no body. Nothing is sent to
# TraceVault.
#
# Usage:
#   TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/shell-proxy-plugin-probe.sh <output-dir>
# The output directory must be new or empty; existing contents are never removed.
set -eu
OUT=${1:?usage: shell-proxy-plugin-probe.sh <output-dir>}
MODEL=${TRACEVAULT_PROBE_MODEL:-opencode/big-pickle}
OPENCODE=${OPENCODE:-opencode}
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd -P)
for ENTRY in "$OUT"/* "$OUT"/.[!.]* "$OUT"/..?*; do
  if [ -e "$ENTRY" ] || [ -L "$ENTRY" ]; then
    echo "Refusing to run: output must be a new or empty directory." >&2
    exit 1
  fi
done
W="$OUT/workspace"
mkdir -p "$W/.opencode/plugin"

cat > "$W/clients.sh" <<'SH'
# Each program asks for a tracevault-probe.invalid URL once; the call's proxy answers itself.
L=${1:-main}
U=tracevault-probe.invalid
export GIT_TERMINAL_PROMPT=0
try() {
  NAME=$1; shift
  if command -v "$1" > /dev/null 2>&1; then
    "$@" > /dev/null 2>&1 < /dev/null
    echo "$NAME: ran (exit $?)"
  else
    echo "$NAME: not installed"
  fi
}
try curl-http curl -sS --max-time 5 "http://$U/$L/curl"
try curl-https curl -sS --max-time 5 "https://$U/$L/curl"
try git git ls-remote "https://$U:4402/$L/git.git"
try python3-urllib python3 -c "import urllib.request; urllib.request.urlopen('https://$U:4405/$L/python', timeout=5)"
# Outlives this call: asks 3 s after the call has returned.
( sleep 3; curl -sS --max-time 5 "http://$U/$L/background" > /dev/null 2>&1 ) > /dev/null 2>&1 &
echo "background: started"
SH

cat > "$W/opencode.json" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "read": "deny",
    "edit": "deny",
    "webfetch": "deny",
    "external_directory": "deny",
    "task": "deny",
    "bash": { "*": "deny", "sh clients.sh main": "allow", "sleep 5": "allow" }
  }
}
JSON

cat > "$W/.opencode/plugin/probe.js" <<JS
import { createServer } from "node:net";
import { appendFileSync } from "node:fs";
const write = (record) => appendFileSync("$OUT/proxy.jsonl", JSON.stringify(record) + "\n");
const runtime = typeof Bun !== "undefined" ? "bun " + Bun.version : "node " + process.version;
const OK_CONNECT = "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n";
const OK_PLAIN = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";

// One server per bash call; it stays open until OpenCode exits, so a background process keeps its call.
const open = (owner) => new Promise((resolve, reject) => {
  const server = createServer((socket) => {
    socket.on("error", () => {});
    socket.once("data", (chunk) => {
      const [method = "", target = ""] = chunk.toString("latin1").split("\r\n")[0].split(" ");
      write({ kind: "request", port: server.address().port, ...owner, method, target });
      socket.end(method === "CONNECT" ? OK_CONNECT : OK_PLAIN);
    });
  });
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});

export const Probe = async () => {
  write({ kind: "loaded", runtime });
  return {
    "shell.env": async (input, output) => {
      const owner = { sessionID: input.sessionID ?? null, callID: input.callID ?? null };
      const started = Date.now();
      try {
        const port = await open(owner);
        const url = "http://127.0.0.1:" + port;
        for (const name of ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"]) output.env[name] = url;
        output.env.NO_PROXY = output.env.no_proxy = "localhost,127.0.0.1,::1";
        write({ kind: "listen", port, ...owner, ms: Date.now() - started });
      } catch (error) {
        write({ kind: "listen-failed", ...owner, error: String(error) });
      }
    },
  };
};
JS

echo "Running the in-plugin shell proxy probe in $W with $MODEL."
(cd "$W" && "$OPENCODE" run -m "$MODEL" "This is a controlled test in a disposable workspace. Use the bash tool twice, one call each: 1) sh clients.sh main  2) sleep 5  Then reply with the output of the first. Errors in the output are expected.") || true

echo '----'
echo "Plugin runtime, ports opened per bash call, and the requests each port received"
echo "(git asks for :4402, python3 for :4405; 'background' arrives after its call returned):"
cat "$OUT/proxy.jsonl" 2> /dev/null || echo "  none: the probe plugin did not load"
echo "Answer: the design works if every request's port is a port its own call opened, git and the background request included."
