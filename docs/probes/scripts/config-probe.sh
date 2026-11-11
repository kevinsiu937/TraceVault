#!/bin/sh
# Ticket 35 probe: what does a plugin's config hook receive?
# Runs only `opencode debug config` in a throwaway workspace:
# no session, no model request, no tool call. OpenCode's home, config, data, cache and
# state folders all point into <output-dir>/home, so no real configuration or credential
# is visible. Every planted secret is fake and contains "tvprobe". The MCP servers are
# disabled, so none starts.
#
# The logging plugin writes <output-dir>/events.jsonl. It replaces every string with its
# length, except permission values, planted "tvprobe" values and {env:...} or {file:...}
# references, so the log shows the config's shape and whether references were substituted.
# It also writes <output-dir>/config-hook.json, the hook's argument verbatim except for
# local paths and the user name, which ticket 35 freezes as a fixture.
#
# Usage: sh docs/probes/scripts/config-probe.sh <output-dir>
# The output directory must be new or empty; existing contents are never removed.
set -eu
OUT=${1:?usage: config-probe.sh <output-dir>}
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
mkdir -p "$W/.opencode/plugin" "$W/.opencode/agent" "$H/config" "$H/data" "$H/cache" "$H/state"
printf 'tvprobe-file-FAKE-0003' > "$W/fake-key.txt"
cat > "$W/opencode.json" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": { "*": "ask", "ls *": "allow" },
    "edit": { "*": "allow", "opencode.json": "deny" },
    "webfetch": "deny"
  },
  "provider": {
    "tvprobe-literal": { "options": { "apiKey": "tvprobe-literal-FAKE-0001" } },
    "tvprobe-env": { "options": { "apiKey": "{env:TRACEVAULT_PROBE_FAKE}" } },
    "tvprobe-file": { "options": { "apiKey": "{file:./fake-key.txt}" } }
  },
  "mcp": {
    "tvprobe-local": {
      "type": "local",
      "command": ["node", "-e", "process.exit(0)"],
      "enabled": false,
      "environment": { "GITHUB_TOKEN": "{env:TRACEVAULT_PROBE_FAKE}", "LITERAL_TOKEN": "tvprobe-literal-FAKE-0004" }
    },
    "tvprobe-remote": {
      "type": "remote",
      "url": "http://127.0.0.1:9/mcp",
      "enabled": false,
      "headers": { "Authorization": "tvprobe-literal-FAKE-0005" }
    }
  },
  "agent": { "build": { "permission": { "bash": "allow" } } }
}
JSON
cat > "$W/.opencode/agent/tvprobe-reviewer.md" <<'MD'
---
description: tvprobe reviewer, defined in a file
mode: subagent
permission:
  edit: deny
---
Review only.
MD
cat > "$W/.opencode/plugin/probe.js" <<JS
import { appendFileSync, writeFileSync } from "node:fs";
const write = (record) => appendFileSync("$OUT/events.jsonl", JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n");
// Verbatim apart from local paths and the user name. Safe to keep only because the run is
// isolated: the config holds nothing but the planted fakes.
const scrubbed = (config) =>
  JSON.stringify({ ...config, ...(typeof config.username === "string" ? { username: "dev" } : {}) }, null, 2)
    .split("$OUT").join("/home/dev/probe");
const keep = (text) => ["allow", "ask", "deny"].includes(text) || text.includes("tvprobe") || /^\{(env|file):/.test(text);
const shape = (value) =>
  typeof value === "string" ? (keep(value) ? value : "<string " + value.length + ">")
  : Array.isArray(value) ? value.map(shape)
  : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]))
  : value;
export const Probe = async (ctx) => {
  write({ probe: "loaded", directory: ctx.directory === "$W" ? "workspace" : "<other>" });
  return {
    config: async (config) => {
      write({ hook: "config", config: shape(config) });
      writeFileSync("$OUT/config-hook.json", scrubbed(config) + "\n");
    },
    event: async ({ event }) => write({ type: event.type }),
  };
};
JS

isolated() {
  (cd "$W" && env -i PATH="$PATH" HOME="$H" XDG_CONFIG_HOME="$H/config" XDG_DATA_HOME="$H/data" \
    XDG_CACHE_HOME="$H/cache" XDG_STATE_HOME="$H/state" TRACEVAULT_PROBE_FAKE=tvprobe-env-FAKE-0002 \
    "$OPENCODE" "$@") || true
}

echo "Running opencode debug config in $W, isolated in $H."
isolated debug config > "$OUT/debug-config.json"

echo '----'
echo "Plugin loads and config hook calls:"
grep -cE '"probe":"loaded"' "$OUT/events.jsonl" 2>/dev/null || echo "0 (the probe plugin did not load)"
grep -cE '"hook":"config"' "$OUT/events.jsonl" 2>/dev/null || echo "0"
echo "Full log: $OUT/events.jsonl"
