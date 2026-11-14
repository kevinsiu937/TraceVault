// Ticket 69: what one new event costs the plugin when it lands in a long
// session, with and without that session's page open in a browser.
//
// Builds the same synthetic session as measure-scale.mjs in a throwaway
// database under the system temp folder, then times POST /hook.
//
// Usage: npm run build, then
//   node docs/probes/scripts/measure-live.mjs [sizes...]   (default 1000 4000 10000)
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
const REPO = new URL("../../../", import.meta.url);
const dist = (p) => new URL(`dist/${p}`, REPO).href;
const { ServiceAssembly } = await import(dist("cli/ServiceAssembly.js"));
const { DashboardServer } = await import(dist("dashboard/DashboardServer.js"));
const { SessionListView } = await import(dist("dashboard/SessionListView.js"));
const { TimelineView } = await import(dist("dashboard/TimelineView.js"));
const { ActivityView } = await import(dist("dashboard/ActivityView.js"));
const fixture = (p) => JSON.parse(readFileSync(new URL(`tests/fixtures/${p}`, REPO), "utf8")).events;
const all = fixture("rules/phase-2-exit/trigger.json");
const actions = all.filter((e) => !e.type.startsWith("session."));
const start = all.find((e) => e.type === "session.start");
const sizes = process.argv.slice(2).map(Number).filter((size) => size > 0);
for (const size of sizes.length > 0 ? sizes : [1000, 4000, 10000]) {
  const id = `ses_live_${size}`;
  const db = join(mkdtempSync(join(tmpdir(), "tv-live-")), "events.db");
  const { service, store } = new ServiceAssembly().open(db);
  const at = (i) => new Date(Date.UTC(2026, 10, 13, 9) + i * 500).toISOString();
  store.append({ ...start, id: `s${size}`, session_id: id, timestamp: at(0) });
  for (let i = 0; i < size; i += 1) {
    const t = actions[i % actions.length];
    store.append({ ...t, id: `e${size}_${i}`, session_id: id, correlation_id: t.correlation_id === null ? null : `c${size}_${i}`, timestamp: at(i + 1) });
  }
  const server = new DashboardServer(service, new SessionListView(), new TimelineView(), new ActivityView());
  const base = `http://127.0.0.1:${await server.listen(0)}`;
  let n = 0;
  const post = async () => {
    n += 1;
    const body = JSON.stringify({ hook: "tool.execute.after", input: { tool: "bash", sessionID: id, callID: `live_${size}_${n}`, args: { command: "ls" } }, output: { title: "ls", metadata: { exit: 0 } } });
    const t0 = performance.now();
    const r = await fetch(`${base}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body });
    await r.text();
    return Math.round(performance.now() - t0);
  };
  const closed = [await post(), await post()];
  const stream = request(`${base}/sessions/${id}/events`);
  stream.on("response", (res) => res.resume());
  stream.end();
  await new Promise((r) => setTimeout(r, 300 + size / 5));
  const open = [await post(), await post(), await post()];
  console.log(`${size} events: POST with no page open ${closed.join("/")} ms; with the live page open ${open.join("/")} ms`);
  stream.destroy();
  await server.close();
  store.close();
}
