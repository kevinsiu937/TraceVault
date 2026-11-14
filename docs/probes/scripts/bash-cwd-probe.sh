#!/bin/sh
# Ticket 62 probe: where does OpenCode's bash tool start each command?
# runs-written-file resolves a relative script path against the session's
# project folder. That is right only if every bash call starts there, even
# after an earlier call ran `cd`. One unattended session runs `pwd`, then
# `cd sub && pwd`, then `pwd` again, as three separate bash calls. A logging
# plugin records each call's arguments (a `workdir` argument would show here),
# its output, and what the `shell.env` hook is told (its `cwd`), to
# <output-dir>/events.jsonl. Nothing is sent to TraceVault.
#
# Safety: only the three commands are allowed; every other shell command asks
# and `opencode run` refuses it. Edits, web fetch and folders outside the
# workspace are denied.
#
# Usage: npm run build, then
#   TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/bash-cwd-probe.sh <output-dir>
# The output directory must be new or empty; existing contents are never removed.
set -eu
OUT=${1:?usage: bash-cwd-probe.sh <output-dir>}
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
mkdir -p "$W/sub" "$W/.opencode/plugin"
cat > "$W/opencode.json" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "read": "allow",
    "edit": "deny",
    "webfetch": "deny",
    "external_directory": "deny",
    "bash": { "*": "ask", "pwd": "allow", "cd sub && pwd": "allow" }
  }
}
JSON
cat > "$W/.opencode/plugin/probe.js" <<JS
import { appendFileSync } from "node:fs";
const write = (record) => appendFileSync("$OUT/events.jsonl", JSON.stringify(record) + "\n");
export const Probe = async () => ({
  "shell.env": async (input) => write({ hook: "shell.env", input }),
  "tool.execute.before": async (input, output) => write({ hook: "tool.execute.before", tool: input.tool, args: output.args }),
  "tool.execute.after": async (input, output) => write({ hook: "tool.execute.after", tool: input.tool, output: output.output }),
});
JS

echo "Running the bash working-folder probe in $W with $MODEL."
(cd "$W" && "$OPENCODE" run -m "$MODEL" "This is a controlled test in a disposable workspace. Use the bash tool three times, one command per call, in this order, and nothing else: 1) pwd 2) cd sub && pwd 3) pwd. Then reply with the three outputs.") || true

echo '----'
echo "Workspace: $W"
echo "Each bash call, as the plugin saw it:"
grep -E '"hook":"(shell.env|tool.execute.before|tool.execute.after)"' "$OUT/events.jsonl" || echo "none logged: the probe plugin did not load"
echo "Answer for ticket 62: if the third pwd prints the workspace, not workspace/sub, each call starts in the project folder."
