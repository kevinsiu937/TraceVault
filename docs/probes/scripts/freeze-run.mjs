// Freezes one recorded session from a TraceVault events database as a rules-seam fixture.
// Usage: node freeze-run.mjs <events.db> <session-id> <workspace-path> <out.json> <expect: trigger|clean> [recording script]
// The workspace path is replaced by /home/dev/exit-run, the temp folder by /tmp and the home folder by
// /home/dev, so no local path is committed.
import { realpathSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const [database, sessionId, workspace, out, kind, script = "phase-2-exit-run.sh"] = process.argv.slice(2);
if (!database || !sessionId || !workspace || !out || (kind !== "trigger" && kind !== "clean")) {
  process.stderr.write("usage: node freeze-run.mjs <events.db> <session-id> <workspace> <out.json> <trigger|clean>\n");
  process.exit(2);
}
const db = new DatabaseSync(database, { readOnly: true });
const rows = db.prepare("SELECT body FROM events WHERE session_id = ? ORDER BY timestamp, rowid").all(sessionId);
// Longest first, so the workspace (often inside the temp folder) is named before the folders that contain it.
const replacements = [
  [workspace, "/home/dev/exit-run"],
  [workspace.replace(/^\/private/, ""), "/home/dev/exit-run"],
  [realpathSync(tmpdir()), "/tmp"],
  [tmpdir(), "/tmp"],
  [homedir(), "/home/dev"],
].sort(([a], [b]) => b.length - a.length);
const scrub = (text) => replacements.reduce((current, [from, to]) => current.split(from).join(to), text);
// Configuration events carry the tester's whole resolved configuration (user name, global providers); Phase 2 rules never read them.
const events = rows.map((row) => JSON.parse(scrub(String(row.body)))).filter((event) => event.type !== "config.snapshot" && event.type !== "mcp.tools");
writeFileSync(
  out,
  `${JSON.stringify({ source: "recorded", note: `${script === "phase-2-exit-run.sh" ? "Phase 2 exit run" : script.replace(/\.sh$/, "")} (${kind}), recorded live by docs/probes/scripts/${script}.`, events, expect: [] }, null, 2)}\n`,
);
process.stdout.write(`${events.length} events from ${sessionId} -> ${out}\n`);
