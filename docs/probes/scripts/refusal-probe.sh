#!/bin/sh
# Ticket 34 probe: what does OpenCode do when a plugin's tool.execute.before refuses a call?
# One unattended session in a throwaway workspace asks the agent to edit opencode.json
# and then run ls. A logging plugin throws in tool.execute.before for any edit or write
# that names opencode.json, and logs every hook and event it sees to
# <output-dir>/events.jsonl. It also checks that TraceVault's rule scanner, and so its
# yaml dependency, loads inside OpenCode's plugin runtime. Nothing is sent to TraceVault.
#
# Safety: edits are allowed only inside the workspace, ls is the one allowed shell
# command, every other shell command asks and `opencode run` refuses it, and web fetch
# and folders outside the workspace are denied.
#
# Usage: npm run build, then
#   TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/refusal-probe.sh <output-dir>
# The output directory must be new or empty; existing contents are never removed.
set -eu
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
OUT=${1:?usage: refusal-probe.sh <output-dir>}
MODEL=${TRACEVAULT_PROBE_MODEL:-opencode/big-pickle}
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
mkdir "$W"
mkdir -p "$W/.opencode/plugin"
cat > "$W/opencode.json" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "read": "allow",
    "edit": "allow",
    "webfetch": "deny",
    "external_directory": "deny",
    "bash": { "*": "ask", "ls": "allow" }
  }
}
JSON
cp "$W/opencode.json" "$OUT/opencode.json.before"
cat > "$W/.opencode/plugin/probe.js" <<JS
import { appendFileSync } from "node:fs";
const write = (record) => appendFileSync("$OUT/events.jsonl", JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n");
const WRITE_TOOLS = new Set(["edit", "write", "patch", "multiedit", "apply_patch"]);
export const Probe = async () => {
  const runtime = typeof Bun === "undefined" ? "node " + process.version : "bun " + Bun.version;
  try {
    const { WorkflowScannerAssembly } = await import("$REPO/dist/cli/WorkflowScannerAssembly.js");
    new WorkflowScannerAssembly().fromDirectory("$REPO/rules").scan([]);
    write({ probe: "scanner", runtime, ok: true });
  } catch (error) {
    write({ probe: "scanner", runtime, ok: false, error: String(error) });
  }
  return {
    "tool.execute.before": async (input, output) => {
      const refused = WRITE_TOOLS.has(input.tool) && JSON.stringify(output.args ?? {}).includes("opencode.json");
      write({ hook: "tool.execute.before", input, args: output.args, refused });
      if (refused) throw new Error("TraceVault probe refused this call: opencode.json is protected.");
    },
    "tool.execute.after": async (input, output) => write({ hook: "tool.execute.after", input, output }),
    event: async ({ event }) => {
      if (event.type === "message.part.delta") return;
      const part = event.properties?.part;
      if (event.type === "message.part.updated" && (part?.type === "tool" || part?.type === "text")) write({ type: event.type, part });
      else if (event.type === "session.error") write({ type: event.type, properties: event.properties });
      else write({ type: event.type });
    },
  };
};
JS

echo "Running the refusal probe in $W with $MODEL."
(cd "$W" && "$OPENCODE" run -m "$MODEL" "This is a controlled test in a disposable workspace. Do these steps in order, using your tools. 1) Use the edit tool to add the top-level key \"probe\": true to opencode.json. 2) Run exactly: ls 3) If any step failed, quote the exact error message you received.") || true

echo '----'
echo "Scanner load inside the plugin runtime:"
grep '"probe":"scanner"' "$OUT/events.jsonl" || echo "not logged: the probe plugin did not load"
echo "Refused calls, after-hooks and tool errors:"
grep -E '"refused":true|"hook":"tool.execute.after"|"status":"error"|"session.error"' "$OUT/events.jsonl" || echo "none"
if cmp -s "$OUT/opencode.json.before" "$W/opencode.json"; then echo "opencode.json unchanged"; else echo "opencode.json CHANGED"; fi
echo "Full log: $OUT/events.jsonl"
