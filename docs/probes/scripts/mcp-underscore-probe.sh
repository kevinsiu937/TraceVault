#!/bin/sh
# Ticket 76 probe: what tool name does OpenCode give a tool of an MCP server
# whose own name has an underscore? TraceVault cuts the name at its first
# underscore, so server `google_drive` with tool `list_files` would be recorded
# as server `google`, tool `drive_list_files`. This probe runs one local MCP
# server named `google_drive` with tools `search` and `list_files`, has the
# agent call each once, and logs the tool name the plugin receives in
# `tool.execute.before` and in the failed tool part of `message.part.updated`.
#
# Safety: the server is fake-mcp-server.mjs, which refuses every call, so no
# tool does anything. Only the two google_drive tools are allowed; bash, edits,
# web fetch, subagents and folders outside the workspace are denied. Nothing is
# sent to TraceVault.
#
# Output: <output-dir>/payloads.jsonl holds each of those payloads with the output folder replaced by /home/dev/probe, ready to freeze as the
# ticket 76 fixture.
#
# Usage:
#   TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/mcp-underscore-probe.sh <output-dir>
# The output directory must be new or empty; existing contents are never removed.
set -eu
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
OUT=${1:?usage: mcp-underscore-probe.sh <output-dir>}
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
cat > "$OUT/tools.json" <<'JSON'
[
  { "name": "search", "description": "Search documents by keyword.", "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] } },
  { "name": "list_files", "description": "List document names.", "inputSchema": { "type": "object", "properties": {} } }
]
JSON
cat > "$W/opencode.json" <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "permission": {
    "read": "deny",
    "bash": "deny",
    "edit": "deny",
    "webfetch": "deny",
    "task": "deny",
    "external_directory": "deny",
    "google_drive_*": "allow"
  },
  "mcp": {
    "google_drive": {
      "type": "local",
      "command": ["node", "$REPO/docs/probes/scripts/fake-mcp-server.mjs", "$OUT/tools.json"]
    }
  }
}
JSON
cat > "$W/.opencode/plugin/probe.js" <<JS
import { appendFileSync } from "node:fs";
// Only the output folder is local here; replace it so the payload can be frozen as is.
const scrub = (record) => JSON.stringify(record).split("$OUT").join("/home/dev/probe");
const write = (record) => appendFileSync("$OUT/payloads.jsonl", scrub(record) + "\n");
// The fake server fails every call, and a failed call never reaches tool.execute.after
// (docs/probes/phase-2-live-probes.md), so log the two places TraceVault sees it instead.
export const Probe = async () => ({
  "tool.execute.before": async (input, output) => write({ hook: "tool.execute.before", input, output }),
  event: async ({ event }) => {
    const part = event.properties?.part;
    if (event.type === "message.part.updated" && part?.type === "tool" && part.state?.status === "error") {
      write({ hook: "event", event });
    }
  },
});
JS

echo "Running the MCP underscore probe in $W with $MODEL."
(cd "$W" && "$OPENCODE" run -m "$MODEL" "This is a controlled test in a disposable workspace. The google_drive MCP server offers two tools. Call its search tool once with the query tracevault, then call its list_files tool once. Both will report an error; that is expected. Then reply with the exact tool names you called.") || true

echo '----'
echo "Tool names the plugin received:"
if [ -s "$OUT/payloads.jsonl" ]; then
  grep -oE '"tool":"[^"]*"' "$OUT/payloads.jsonl" | sort -u
else
  echo "none logged: the probe plugin did not load or no tool was called"
fi
echo "Answer for ticket 76: if the names are google_drive_search and google_drive_list_files, the server name cannot be told from the tool name without the configuration."
echo "Payloads to freeze: $OUT/payloads.jsonl"
