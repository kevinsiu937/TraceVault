#!/bin/sh
# Ticket 41 probe: what can a plugin see of the tools the model is offered,
# MCP tools included?
# One `opencode run` in a throwaway workspace, pointed at a model address that
# does not answer: OpenCode creates the session and prepares its tools, then the
# model request fails, so no model reads anything and no tool runs. OpenCode's
# home, config, data, cache and state folders all point into <output-dir>/home,
# so no real configuration or credential is visible. The workspace connects the
# fake MCP server in this folder, which refuses every call; one of its two tools
# has a poisoned description, kept for ticket 42.
#
# The logging plugin writes <output-dir>/tool-definition-hook.json (what the
# tool.definition hook saw), <output-dir>/tool-list.json (what the plugin's
# client got from OpenCode's tool list endpoint) and <output-dir>/events.jsonl,
# with local paths scrubbed.
#
# Usage: sh docs/probes/scripts/tool-probe.sh <output-dir>
# The output directory must be new or empty; existing contents are never removed.
set -eu
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
OUT=${1:?usage: tool-probe.sh <output-dir>}
OPENCODE=${OPENCODE:-opencode}
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
for ENTRY in "$OUT"/* "$OUT"/.[!.]* "$OUT"/..?*; do
  if [ -e "$ENTRY" ] || [ -L "$ENTRY" ]; then
    echo "Refusing to run: output must be a new or empty directory." >&2
    exit 1
  fi
done
W="$OUT/workspace"
H="$OUT/home"
mkdir -p "$W/.opencode/plugin" "$H/config" "$H/data" "$H/cache" "$H/state"
cat > "$W/opencode.json" <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "permission": { "bash": "ask", "edit": "ask", "webfetch": "deny" },
  "provider": {
    "deadend": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "http://127.0.0.1:9/v1", "apiKey": "tvprobe-literal-FAKE-0601" },
      "models": { "m": { "name": "m" } }
    }
  },
  "mcp": {
    "fake": {
      "type": "local",
      "command": ["node", "$REPO/docs/probes/scripts/fake-mcp-server.mjs", "$REPO/docs/probes/scripts/fake-mcp-tools.json"]
    }
  }
}
JSON
cat > "$W/.opencode/plugin/probe.js" <<JS
import { appendFileSync, writeFileSync } from "node:fs";
const write = (record) => appendFileSync("$OUT/events.jsonl", JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n");
const save = (file, value) =>
  writeFileSync("$OUT/" + file, JSON.stringify(value, null, 2).split("$OUT").join("/home/dev/probe").split("$REPO").join("/home/dev/tracevault") + "\n");
export const Probe = async (ctx) => {
  const definitions = [];
  let listed = false;
  return {
    "tool.definition": async (input, output) => {
      definitions.push({ toolID: input.toolID, keys: Object.keys(output), description: output.description, jsonSchema: output.jsonSchema ?? null });
      save("tool-definition-hook.json", definitions);
    },
    event: async ({ event }) => {
      write({ type: event.type });
      if (event.type !== "session.created" || listed) return;
      listed = true;
      try {
        const ids = await ctx.client.tool.ids();
        const list = await ctx.client.tool.list({ query: { provider: "deadend", model: "m" } });
        const mcp = await ctx.client.mcp.status();
        save("tool-list.json", { ids: ids.data ?? ids.error, list: list.data ?? list.error, mcp: mcp.data ?? mcp.error });
      } catch (error) {
        write({ probe: "tool list", error: String(error) });
      }
    },
  };
};
JS

echo "Running the tool probe in $W, isolated in $H."
(cd "$W" && env -i PATH="$PATH" HOME="$H" XDG_CONFIG_HOME="$H/config" XDG_DATA_HOME="$H/data" \
  XDG_CACHE_HOME="$H/cache" XDG_STATE_HOME="$H/state" \
  "$OPENCODE" run -m deadend/m "Reply with the word ok.") || true

echo '----'
for FILE in tool-definition-hook.json tool-list.json; do
  if [ -f "$OUT/$FILE" ]; then
    printf '%s: %s tools, fake MCP tools named: ' "$FILE" "$(grep -c '"description"' "$OUT/$FILE" || true)"
    grep -o 'fake_[a-z_]*' "$OUT/$FILE" | sort -u | tr '\n' ' ' || true
    echo
  else
    echo "$FILE: not written"
  fi
done
echo "Full log: $OUT/events.jsonl"
