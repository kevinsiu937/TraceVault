#!/bin/sh
# Phase 3 exit run (ticket 43): one OpenCode session in a deliberately
# misconfigured workspace, which should raise every static rule, and one in a
# clean workspace, which should raise none. Both are captured live by TraceVault,
# installed with `tracevault init`, into a throwaway database, then frozen.
#
# Safety: the risky permissions belong to a subagent, "risky", that nothing
# invokes: the task tool is denied, so the agent that runs cannot hand work to
# it. The agent that runs asks before any shell command but ls, may not edit,
# and may not fetch. The fake MCP server's tools are denied, so the model is
# never offered them, and the server refuses every call anyway. The planted
# GitHub token is fake. The prompt asks for one word and no tools.
#
# Usage: npm run build, then
#   TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/phase-3-exit-run.sh <output-dir>
# The output directory must be new or empty; existing contents are never removed.
set -eu
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
OUT=${1:?usage: phase-3-exit-run.sh <output-dir>}
PORT=4339
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
M="$OUT/workspace"
C="$OUT/clean"
mkdir -p "$M" "$C"
cat > "$M/opencode.json" <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "permission": { "bash": { "*": "ask", "ls *": "allow" }, "edit": "deny", "webfetch": "deny", "task": "deny", "fake_*": "deny" },
  "agent": {
    "risky": {
      "mode": "subagent",
      "description": "Phase 3 exit run: a deliberately misconfigured agent that nothing invokes.",
      "permission": { "bash": "allow", "edit": "allow", "webfetch": "allow", "read": { "*.env": "allow" }, "doom_loop": "allow" }
    }
  },
  "mcp": {
    "fake": {
      "type": "local",
      "command": ["node", "$REPO/docs/probes/scripts/fake-mcp-server.mjs", "$REPO/docs/probes/scripts/fake-mcp-tools.json"],
      "environment": { "GITHUB_TOKEN": "tvexit-planted-FAKE-0001" }
    }
  }
}
JSON
cat > "$C/opencode.json" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": { "bash": { "*": "ask", "ls *": "allow" }, "edit": "deny", "webfetch": "deny", "task": "deny" }
}
JSON
for W in "$M" "$C"; do
  node "$REPO/dist/cli/index.js" init --dir "$W" > /dev/null
  sed -i.bak "s#127.0.0.1:4319/hook#127.0.0.1:$PORT/hook#" "$W/.opencode/plugin/tracevault.js"
  rm "$W/.opencode/plugin/tracevault.js.bak"
done

TRACEVAULT_OPENCODE_DB="$OUT/no-agent-store.db" node "$REPO/dist/cli/index.js" run --port "$PORT" --db "$OUT/events.db" > "$OUT/service.log" 2>&1 &
SERVICE=$!
trap 'kill $SERVICE 2>/dev/null || true' EXIT
curl -s --retry 20 --retry-connrefused --retry-delay 1 -o /dev/null "http://127.0.0.1:$PORT/"

for W in "$M" "$C"; do
  (cd "$W" && "$OPENCODE" run -m "$MODEL" "Reply with the single word ok. Do not use any tools.") >> "$OUT/opencode.log" 2>&1 || true
done

mkdir -p "$REPO/tests/fixtures/phase-3-exit"
node "$REPO/docs/probes/scripts/freeze-config-run.mjs" "$OUT/events.db" "$M" "$REPO/tests/fixtures/phase-3-exit/misconfigured.json" "$MODEL"
node "$REPO/docs/probes/scripts/freeze-config-run.mjs" "$OUT/events.db" "$C" "$REPO/tests/fixtures/phase-3-exit/clean.json" "$MODEL"
for NAME in misconfigured clean; do
  SESSION=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).events[0].session_id)' "$REPO/tests/fixtures/phase-3-exit/$NAME.json")
  curl -s "http://127.0.0.1:$PORT/sessions/$SESSION/config" > "$OUT/$NAME.html"
  printf '%s session %s, static findings by rule:\n' "$NAME" "$SESSION"
  if grep -q 'class="config-finding"' "$OUT/$NAME.html"; then
    grep -o '<li class="config-finding" data-rule="[^"]*"' "$OUT/$NAME.html" | sort | uniq -c
  else
    echo "      none"
  fi
done
