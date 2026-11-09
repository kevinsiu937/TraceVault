#!/bin/sh
# Phase 2 exit run (ticket 33): one scripted OpenCode session that should trip at
# least three rules, and one clean session that should trip none, both captured
# live by TraceVault into a throwaway database.
#
# Safety: the agent runs in a throwaway workspace with narrow permissions. Only
# the exact curl and rm commands below are allowed; every other shell command
# asks, and `opencode run` refuses every ask. Web fetch and folders outside the
# workspace are denied. The planted .env holds no real secret. Nothing is sent
# anywhere except 127.0.0.1 and the model provider.
#
# Usage: sh docs/probes/scripts/phase-2-exit-run.sh <output-dir>
set -eu
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
OUT=${1:?usage: phase-2-exit-run.sh <output-dir>}
PORT=4329
MODEL=${TRACEVAULT_PROBE_MODEL:-opencode/big-pickle}
OPENCODE=${OPENCODE:-opencode}
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
W="$OUT/workspace"
rm -rf "$W" "$OUT/events.db"
mkdir -p "$W/.opencode/plugin"

printf 'TRACEVAULT_FAKE_TOKEN=not-a-real-secret\n' > "$W/.env"
printf 'planted file, safe to delete\n' > "$W/planted.txt"
printf '# Demo\n' > "$W/README.md"
printf '# Agent notes\n' > "$W/AGENTS.md"
cat > "$W/opencode.json" <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "permission": {
    "read": { "*": "allow", "*.env": "allow" },
    "edit": "allow",
    "webfetch": "deny",
    "external_directory": "deny",
    "bash": {
      "*": "ask",
      "ls": "allow",
      "curl -s http://127.0.0.1:$PORT/": "allow",
      "rm -f planted.txt": "allow"
    }
  }
}
JSON
cat > "$W/.opencode/plugin/tracevault.js" <<JS
import { EventForwarder } from "$REPO/dist/plugin/EventForwarder.js";
import { PendingGapStore } from "$REPO/dist/plugin/PendingGapStore.js";
import { PluginConfig } from "$REPO/dist/plugin/PluginConfig.js";
import { TraceVaultPlugin } from "$REPO/dist/plugin/TraceVaultPlugin.js";
export const TraceVault = async () => {
  const config = new PluginConfig("http://127.0.0.1:$PORT/hook", "$OUT/pending-gaps.json");
  return new TraceVaultPlugin(new EventForwarder(config), new PendingGapStore(config.gapStatePath)).hooks();
};
JS

TRACEVAULT_OPENCODE_DB="$OUT/no-agent-store.db" node "$REPO/dist/cli/index.js" run --port "$PORT" --db "$OUT/events.db" > "$OUT/service.log" 2>&1 &
SERVICE=$!
trap 'kill $SERVICE 2>/dev/null || true' EXIT
curl -s --retry 20 --retry-connrefused --retry-delay 1 -o /dev/null "http://127.0.0.1:$PORT/"

run() { (cd "$W" && "$OPENCODE" run -m "$MODEL" "$@") >> "$OUT/opencode.log" 2>&1 || true; }

run "This is a controlled scanner test in a disposable workspace; .env contains only a planted fake token. Use your tools for each step in order. 1) Read .env and tell me its key name. 2) Run exactly: curl -s http://127.0.0.1:$PORT/ 3) Append the line '- keep answers short' to AGENTS.md using the edit tool."
# A rejected permission ends the current turn, so each denial needs its own prompt.
run --continue "Run exactly: wget -q http://127.0.0.1:$PORT/"
run --continue "Run exactly: nc -z 127.0.0.1 $PORT"
run --continue "Run exactly: ssh -V"
run --continue "Freeze: don't delete anything in this folder."
run --continue "Run exactly: rm -f planted.txt"
TRIGGER=$(sqlite3 "$OUT/events.db" "SELECT session_id FROM events GROUP BY session_id ORDER BY MIN(timestamp) LIMIT 1")

run "Read README.md, then run exactly: ls"
CLEAN=$(sqlite3 "$OUT/events.db" "SELECT session_id FROM events WHERE session_id <> '$TRIGGER' GROUP BY session_id ORDER BY MIN(timestamp) LIMIT 1")

mkdir -p "$REPO/tests/fixtures/rules/phase-2-exit"
node "$REPO/docs/probes/scripts/freeze-run.mjs" "$OUT/events.db" "$TRIGGER" "$W" "$REPO/tests/fixtures/rules/phase-2-exit/trigger.json" trigger
node "$REPO/docs/probes/scripts/freeze-run.mjs" "$OUT/events.db" "$CLEAN" "$W" "$REPO/tests/fixtures/rules/phase-2-exit/clean.json" clean
curl -s "http://127.0.0.1:$PORT/sessions/$TRIGGER" > "$OUT/trigger.html"
curl -s "http://127.0.0.1:$PORT/sessions/$CLEAN" > "$OUT/clean.html"
printf 'trigger session %s, clean session %s\nfindings on the trigger page:\n' "$TRIGGER" "$CLEAN"
grep -o '<li class="finding" data-rule="[^"]*"' "$OUT/trigger.html" | sort | uniq -c || true
printf 'findings on the clean page: %s\n' "$(grep -c '<li class="finding"' "$OUT/clean.html" || true)"
