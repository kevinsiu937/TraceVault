// Freezes one recorded session from a TraceVault events database as a rules-seam fixture.
// Usage: node freeze-run.mjs <events.db> <session-id> <workspace-path> <out.json> <expect: trigger|clean>
// The workspace path is replaced by /home/dev/exit-run so no local path is committed.
import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const [database, sessionId, workspace, out, kind] = process.argv.slice(2);
if (!database || !sessionId || !workspace || !out || (kind !== "trigger" && kind !== "clean")) {
  process.stderr.write("usage: node freeze-run.mjs <events.db> <session-id> <workspace> <out.json> <trigger|clean>\n");
  process.exit(2);
}
const db = new DatabaseSync(database, { readOnly: true });
const rows = db.prepare("SELECT body FROM events WHERE session_id = ? ORDER BY timestamp, rowid").all(sessionId);
const scrub = (text) => text.split(workspace).join("/home/dev/exit-run").split(workspace.replace(/^\/private/, "")).join("/home/dev/exit-run");
const events = rows.map((row) => JSON.parse(scrub(String(row.body))));
writeFileSync(
  out,
  `${JSON.stringify({ source: "recorded", note: `Phase 2 exit run (${kind}), recorded live by docs/probes/scripts/phase-2-exit-run.sh.`, events, expect: [] }, null, 2)}\n`,
);
process.stdout.write(`${events.length} events from ${sessionId} -> ${out}\n`);
