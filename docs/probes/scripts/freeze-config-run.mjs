// Freezes one Phase 3 exit session: its latest configuration snapshot and the
// latest tool list of each MCP server the workspace defines, as stored events.
// Usage: node freeze-config-run.mjs <events.db> <workspace> <fixture.json> <model>
// Only the workspace's own permission, agents and MCP servers are kept, so a
// tester's global configuration never reaches the fixture. Paths are scrubbed.
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const [database, workspace, fixture, model] = process.argv.slice(2);
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const events = new DatabaseSync(database).prepare("SELECT body FROM events ORDER BY timestamp, rowid").all().map((row) => JSON.parse(row.body));
const real = realpathSync(workspace);
const start = events.find((event) => event.type === "session.start" && [workspace, real].includes(event.data.project_dir));
if (start === undefined) {
  throw new Error(`no session started in ${workspace}`);
}
const own = JSON.parse(readFileSync(join(workspace, "opencode.json"), "utf8"));
const session = events.filter((event) => event.session_id === start.session_id);
const snapshot = session.filter((event) => event.type === "config.snapshot").at(-1);
if (snapshot === undefined) {
  throw new Error(`session ${start.session_id} recorded no configuration`);
}
const pick = (block, names) => Object.fromEntries(Object.entries(block ?? {}).filter(([name]) => names.includes(name)));
const config = {
  permission: snapshot.data.config.permission,
  agent: pick(snapshot.data.config.agent, Object.keys(own.agent ?? {})),
  mcp: pick(snapshot.data.config.mcp, Object.keys(own.mcp ?? {})),
};
const lists = new Map();
for (const event of session) {
  if (event.type === "mcp.tools" && Object.keys(own.mcp ?? {}).includes(event.data.server)) {
    lists.set(event.data.server, event);
  }
}
const repo = dirname(dirname(dirname(dirname(new URL(import.meta.url).pathname))));
const scrub = (text) =>
  [[repo, "/home/dev/tracevault"], [dirname(real), "/home/dev/exit"], [dirname(workspace), "/home/dev/exit"], [homedir(), "/home/dev"]].reduce(
    (result, [from, to]) => result.split(from).join(to),
    text,
  );
const body = {
  source: "recorded",
  note: `Phase 3 exit run, recorded live by docs/probes/scripts/phase-3-exit-run.sh with ${model}. The snapshot keeps only the workspace's own permission, agents and MCP servers; its digest is that of the full recorded snapshot.`,
  events: [{ ...snapshot, data: { ...snapshot.data, config } }, ...lists.values()],
};
writeFileSync(fixture, scrub(JSON.stringify(body, null, 2)) + "\n");
console.log(`froze ${body.events.length} events of ${start.session_id} into ${fixture}`);
