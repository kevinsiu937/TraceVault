#!/bin/sh
# Ticket 65 probe: can a proxy tell which bash call made a connection?
# The shell proxy (docs/spec/shell-proxy.md) puts the session and call ids in
# the proxy address as user name and password; clients send them as a
# Proxy-Authorization header. This probe records, per program (curl, git, pip,
# npm, python3 urllib), whether it used the proxy variables and whether it sent
# the header, and what OpenCode's shell.env hook receives for a subagent's call.
#
# Safety: the proxy is a throwaway logger on 127.0.0.1 that answers every
# request itself and connects nowhere. Every URL names tracevault-probe.invalid,
# a reserved name that never resolves, so a program that skips the proxy fails
# at its DNS lookup and sends nothing. The only commands allowed are the two
# runs of the prepared clients.sh; edits, web fetch and folders outside the
# workspace are denied. The log keeps the request line, the decoded proxy user
# name and password (a session id and a call id) and the User-Agent: no other
# header, no body. Nothing is sent to TraceVault.
#
# Usage:
#   TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/shell-proxy-probe.sh <output-dir>
# The output directory must be new or empty; existing contents are never removed.
set -eu
OUT=${1:?usage: shell-proxy-probe.sh <output-dir>}
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

cat > "$OUT/proxy.mjs" <<JS
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";
const log = (record) => appendFileSync("$OUT/proxy.jsonl", JSON.stringify(record) + "\n");
const credentials = (headers) => {
  const value = headers["proxy-authorization"];
  if (value === undefined) return null;
  const [scheme, token = ""] = value.split(" ");
  return scheme.toLowerCase() === "basic" ? Buffer.from(token, "base64").toString() : "<" + scheme + ">";
};
// A client that waits to be asked (libcurl in git does) sends credentials only after a 407.
const CHALLENGE = "HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"tracevault\"\r\nContent-Length: 0\r\n\r\n";
const server = createServer((request, response) => {
  const auth = credentials(request.headers);
  log({ kind: "http", target: request.url, auth, agent: request.headers["user-agent"] ?? null });
  if (auth === null) {
    response.writeHead(407, { "proxy-authenticate": 'Basic realm="tracevault"' }).end();
    return;
  }
  response.writeHead(404, { "content-type": "text/plain" }).end("tracevault probe\n");
});
server.on("connect", (request, socket) => {
  const auth = credentials(request.headers);
  log({ kind: "https", target: request.url, auth, agent: request.headers["user-agent"] ?? null });
  socket.end(auth === null ? CHALLENGE : "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
});
server.listen(0, "127.0.0.1", () => writeFileSync("$OUT/proxy-port", String(server.address().port)));
JS

cat > "$W/clients.sh" <<'SH'
# Each program asks for a tracevault-probe.invalid URL once; the proxy answers itself.
# HTTPS hides the path from a proxy, so each program uses its own port: the CONNECT target names it.
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
try pip python3 -m pip download --no-deps --retries 0 --timeout 5 --dest pip-out --index-url "https://$U:4403/$L/pip/simple" tracevault-probe
try npm npm view tracevault-probe --registry "https://$U:4404/$L/npm/" --fetch-retries=0 --fetch-timeout=5000
try python3-urllib python3 -c "import urllib.request; urllib.request.urlopen('https://$U:4405/$L/python', timeout=5)"
SH

cat > "$W/opencode.json" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "read": "deny",
    "edit": "deny",
    "webfetch": "deny",
    "external_directory": "deny",
    "task": "allow",
    "bash": { "*": "deny", "sh clients.sh main": "allow", "sh clients.sh sub": "allow" }
  }
}
JSON

cat > "$W/.opencode/plugin/probe.js" <<JS
import { appendFileSync, readFileSync } from "node:fs";
const write = (file, record) => appendFileSync("$OUT/" + file, JSON.stringify(record) + "\n");
export const Probe = async () => ({
  "shell.env": async (input, output) => {
    let port = null;
    try { port = readFileSync("$OUT/proxy-port", "utf8").trim(); } catch {}
    // cwd is left out: it is a local path.
    write("shell-env.jsonl", { sessionID: input.sessionID ?? null, callID: input.callID ?? null, proxy: port !== null });
    if (port === null) return;
    const url = "http://" + encodeURIComponent(input.sessionID ?? "none") + ":" + encodeURIComponent(input.callID ?? "none") + "@127.0.0.1:" + port;
    for (const name of ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"]) output.env[name] = url;
  },
  "tool.execute.before": async (input) => write("calls.jsonl", { tool: input.tool, sessionID: input.sessionID, callID: input.callID }),
});
JS

node "$OUT/proxy.mjs" &
PROXY=$!
trap 'kill $PROXY 2>/dev/null || true' EXIT

echo "Running the shell proxy probe in $W with $MODEL."
(cd "$W" && "$OPENCODE" run -m "$MODEL" "This is a controlled test in a disposable workspace. 1) Use the bash tool to run exactly: sh clients.sh main  2) Then use the task tool to start a general subagent whose only job is to run exactly this with its bash tool and report the output: sh clients.sh sub  3) Reply with both outputs. Errors in the output are expected.") || true

echo '----'
echo "shell.env calls (session and call each bash call got):"
cat "$OUT/shell-env.jsonl" 2> /dev/null || echo "  none: the probe plugin did not load"
echo "Tool calls, with the session each ran in:"
cat "$OUT/calls.jsonl" 2> /dev/null || echo "  none"
echo "Requests the proxy received (auth is session:call, null if none was sent;"
echo "  :443 and http:// are curl, :4402 git, :4403 pip, :4404 npm, :4405 python3 urllib):"
cat "$OUT/proxy.jsonl" 2> /dev/null || echo "  none: no program used the proxy"
echo "Answer for ticket 65: a program attributes its connections only if it appears above with a non-null auth."
