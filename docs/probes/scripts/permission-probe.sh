#!/bin/sh
# Ticket 32 probe: does a plugin see a permission being granted, and in which shape?
# Run it interactively and APPROVE the one permission prompt OpenCode shows.
# It logs every event type the plugin receives, with full properties for
# permission events, to <output-dir>/events.jsonl. Nothing is sent to TraceVault.
#
# Usage: sh docs/probes/scripts/permission-probe.sh <output-dir>
# The output directory must be new or empty; existing contents are never removed.
set -eu
OUT=${1:?usage: permission-probe.sh <output-dir>}
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
for ENTRY in "$OUT"/* "$OUT"/.[!.]* "$OUT"/..?*; do
  if [ -e "$ENTRY" ] || [ -L "$ENTRY" ]; then
    echo "Refusing to run: output must be a new or empty directory." >&2
    exit 1
  fi
done
W="$OUT/workspace"
mkdir "$W"
mkdir -p "$W/.opencode/plugin"
cat > "$W/opencode.json" <<'JSON'
{ "$schema": "https://opencode.ai/config.json", "permission": { "bash": "ask" } }
JSON
cat > "$W/.opencode/plugin/probe.js" <<JS
import { appendFileSync } from "node:fs";
const write = (record) => appendFileSync("$OUT/events.jsonl", JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n");
export const Probe = async () => ({
  event: async ({ event }) => {
    if (event.type === "message.part.delta") return;
    write(event.type.startsWith("permission") ? { type: event.type, properties: event.properties } : { type: event.type });
  },
  "permission.ask": async (input, output) => write({ hook: "permission.ask", input, output }),
});
JS
echo "Starting OpenCode in $W. Ask it to run: ls  — then APPROVE the permission prompt once, and quit."
cd "$W" && "${OPENCODE:-opencode}"
echo "Permission records:"
grep -i permission "$OUT/events.jsonl" || echo "none: plugins did not see a permission event"
