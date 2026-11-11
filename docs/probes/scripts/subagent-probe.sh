#!/bin/sh
# Ticket 31 probe: which folder does OpenCode report for a subagent, and for a session
# resumed from a different folder?
# Run 1, in <output-dir>/workspace, asks the agent to start one subagent with the task
# tool that reads README.md. Run 2, in <output-dir>/elsewhere, resumes that root session
# with --session and asks for a read of notes.md there. A logging plugin in both folders
# writes the plugin context, every session.created and session.updated, every
# permission.asked, every tool.execute.before and every tool part to
# <output-dir>/events.jsonl. Nothing is sent to TraceVault.
#
# Safety: both folders allow reads and deny edits, web fetch and folders outside
# themselves. ls (with any flags) is the one allowed shell command; every other shell
# command asks and `opencode run` refuses it. A refused ask ends the turn, so the
# prompts keep the agent off the shell.
#
# Usage:
#   TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/subagent-probe.sh <output-dir>
# The output directory must be new or empty and outside any git repository;
# existing contents are never removed.
set -eu
OUT=${1:?usage: subagent-probe.sh <output-dir>}
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
E="$OUT/elsewhere"
for DIR in "$W" "$E"; do
  mkdir -p "$DIR/.opencode/plugin"
  cat > "$DIR/opencode.json" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "read": "allow",
    "edit": "deny",
    "webfetch": "deny",
    "external_directory": "deny",
    "bash": { "*": "ask", "ls": "allow", "ls *": "allow" }
  }
}
JSON
  cat > "$DIR/.opencode/plugin/probe.js" <<JS
import { appendFileSync } from "node:fs";
const write = (record) => appendFileSync("$OUT/events.jsonl", JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n");
export const Probe = async (ctx) => {
  write({ probe: "context", loadedFrom: "$DIR", directory: ctx.directory, worktree: ctx.worktree, project: ctx.project?.id });
  return {
    "tool.execute.before": async (input, output) => write({ hook: "tool.execute.before", input, args: output.args }),
    event: async ({ event }) => {
      if (event.type === "message.part.delta") return;
      const info = event.properties?.info;
      const part = event.properties?.part;
      if (event.type === "session.created" || event.type === "session.updated") {
        write({ type: event.type, info: { id: info?.id, parentID: info?.parentID, directory: info?.directory, projectID: info?.projectID, title: info?.title } });
        if (event.type === "session.created" && !info?.parentID) appendFileSync("$OUT/root-sessions", info?.id + "\n");
      } else if (event.type === "permission.asked") write({ type: event.type, properties: event.properties });
      else if (event.type === "message.part.updated" && part?.type === "tool") write({ type: event.type, part });
      else write({ type: event.type });
    },
  };
};
JS
done
printf '# Probe workspace\n' > "$W/README.md"
printf '# Notes in the other folder\n' > "$E/notes.md"

run() { FOLDER=$1; shift; (cd "$FOLDER" && "$OPENCODE" run -m "$MODEL" "$@") || true; }

echo "Run 1: a subagent, in $W with $MODEL."
run "$W" "This is a controlled test in a disposable workspace. Do not use the shell. Make these tool calls in order. 1) Use the task tool to start one subagent of type general whose only job is to use the read tool on README.md and report its first line. 2) After it returns, use the read tool on README.md yourself. 3) Reply with the first line."

ROOT=$(head -n 1 "$OUT/root-sessions" 2>/dev/null || true)
if [ -n "$ROOT" ]; then
  echo "Run 2: resume $ROOT from $E."
  run "$E" --session "$ROOT" "Continue the controlled test. Do not use the shell. Use the read tool on notes.md in the current folder, then reply with its first line. If the read fails, quote the exact error message."
else
  echo "Run 2 skipped: run 1 logged no root session."
fi

echo '----'
echo "Plugin contexts:"
grep '"probe":"context"' "$OUT/events.jsonl" || echo "none: the probe plugin did not load"
echo "Sessions created and updated:"
grep -E '"type":"session\.(created|updated)"' "$OUT/events.jsonl" | sed 's/^{"at":"[^"]*",//' | sort -u || echo "none"
echo "Tool calls:"
grep '"hook":"tool.execute.before"' "$OUT/events.jsonl" || echo "none"
echo "Permission prompts and tool errors:"
grep -E '"type":"permission.asked"|"status":"error"' "$OUT/events.jsonl" || echo "none"
echo "Full log: $OUT/events.jsonl"
