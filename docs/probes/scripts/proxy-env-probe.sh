#!/bin/sh
# Ticket 64 probe: can a TraceVault plugin route the agent's shell through a
# local proxy? OpenCode 1.18.32's plugin types offer a `shell.env` hook
# (input: cwd, sessionID, callID; output: env). This probe's plugin sets
# HTTPS_PROXY, HTTP_PROXY and TRACEVAULT_PROBE in that hook, and the agent
# prints exactly those three variables. If they come back, a later ticket (65)
# can point the shell at a TraceVault proxy.
#
# Safety: the proxy address is 127.0.0.1:9, where nothing listens, and nothing
# in this probe makes a request. Only the one printenv command is allowed, and
# it names the three variables, so no other environment variable (no API key)
# reaches the model. Edits, web fetch and folders outside the workspace are
# denied. Nothing is sent to TraceVault.
#
# Usage: npm run build, then
#   TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/proxy-env-probe.sh <output-dir>
# The output directory must be new or empty; existing contents are never removed.
set -eu
OUT=${1:?usage: proxy-env-probe.sh <output-dir>}
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
cat > "$W/opencode.json" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "read": "allow",
    "edit": "deny",
    "webfetch": "deny",
    "external_directory": "deny",
    "bash": { "*": "ask", "printenv HTTPS_PROXY": "allow", "printenv HTTP_PROXY": "allow", "printenv TRACEVAULT_PROBE": "allow" }
  }
}
JSON
cat > "$W/.opencode/plugin/probe.js" <<JS
import { appendFileSync } from "node:fs";
const write = (record) => appendFileSync("$OUT/events.jsonl", JSON.stringify(record) + "\n");
export const Probe = async () => ({
  "shell.env": async (input, output) => {
    output.env.HTTPS_PROXY = "http://127.0.0.1:9/secure";
    output.env.HTTP_PROXY = "http://127.0.0.1:9/plain";
    output.env.TRACEVAULT_PROBE = "set-by-shell.env";
    write({ hook: "shell.env", input });
  },
  "tool.execute.after": async (input, output) => write({ hook: "tool.execute.after", tool: input.tool, output: output.output }),
});
JS

echo "Running the proxy environment probe in $W with $MODEL."
(cd "$W" && "$OPENCODE" run -m "$MODEL" "This is a controlled test in a disposable workspace. Use the bash tool three times, one call each, to run exactly: 1) printenv HTTPS_PROXY  2) printenv HTTP_PROXY  3) printenv TRACEVAULT_PROBE  Then reply with the three outputs.") || true

echo '----'
echo "shell.env calls and the bash output, as the plugin saw them:"
grep -E '"hook":"(shell.env|tool.execute.after)"' "$OUT/events.jsonl" || echo "none logged: the probe plugin did not load"
# Each value is distinct, so the bash output says exactly which variable got through.
for NAME in "HTTPS_PROXY:127.0.0.1:9/secure" "HTTP_PROXY:127.0.0.1:9/plain" "TRACEVAULT_PROBE:set-by-shell.env"; do
  if grep -q "${NAME#*:}" "$OUT/events.jsonl" 2>/dev/null; then echo "  ${NAME%%:*}: reached bash"; else echo "  ${NAME%%:*}: did not reach bash"; fi
done
echo "Answer for ticket 64: the shell can be pointed at a TraceVault proxy only if HTTPS_PROXY and HTTP_PROXY reached bash."
