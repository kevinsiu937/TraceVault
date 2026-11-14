// Ticket 56: how slow and how big TraceVault gets as a session grows.
//
// Builds one synthetic session per size in a throwaway database under the
// system temp folder (never data/), then times the service, the session page
// over HTTP and the report, and measures the database file.
//
// The session repeats the Phase 2 exit run's recorded events (prompts, shell,
// file reads and writes, refused calls) with fresh ids and times, after the
// Phase 3 exit run's configuration snapshot and tool lists, so every rule has
// realistic work to do.
//
// Usage: npm run build, then
//   node docs/probes/scripts/measure-scale.mjs [sizes...]   (default 1000 10000 50000)
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { arch, cpus, platform, tmpdir, totalmem } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const REPO = new URL("../../../", import.meta.url);
const dist = (path) => new URL(`dist/${path}`, REPO).href;
const { ServiceAssembly } = await import(dist("cli/ServiceAssembly.js"));
const { DashboardServer } = await import(dist("dashboard/DashboardServer.js"));
const { SessionListView } = await import(dist("dashboard/SessionListView.js"));
const { TimelineView } = await import(dist("dashboard/TimelineView.js"));
const { ActivityView } = await import(dist("dashboard/ActivityView.js"));
const { SessionPageView } = await import(dist("dashboard/SessionPageView.js"));
const { SessionHeaderView } = await import(dist("dashboard/SessionHeaderView.js"));
const { DetailPaneView } = await import(dist("dashboard/DetailPaneView.js"));
const panes = await Promise.all(
  ["RulesNoticeView", "SkippedCallsView", "FindingsPanelView", "FileRailView", "TimelineView", "WaterfallView", "GraphView", "SubagentPortalView", "ReplayBarView"].map(
    async (name) => new (await import(dist(`dashboard/${name}.js`)))[name](),
  ),
);
const { ReportView } = await import(dist("dashboard/ReportView.js"));
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

const fixture = (path) => JSON.parse(readFileSync(new URL(`tests/fixtures/${path}`, REPO), "utf8")).events;
const actions = fixture("rules/phase-2-exit/trigger.json").filter((event) => !event.type.startsWith("session."));
const [start, end] = ["session.start", "session.end"].map((type) => fixture("rules/phase-2-exit/trigger.json").find((event) => event.type === type));
const preamble = fixture("phase-3-exit/misconfigured.json").filter((event) => event.type === "config.snapshot" || event.type === "mcp.tools");
// Each measurement opens a fresh service, so the first call is cold (no findings cached) and the rest are warm.
const RUNS = Number(process.env.RUNS ?? 5);

function session(size) {
  const id = `ses_scale_${size}`;
  const base = Date.UTC(2026, 10, 13, 9);
  const at = (index) => new Date(base + index * 500).toISOString();
  const events = [{ ...start, id: `evt_${size}_start`, session_id: id, timestamp: at(0) }];
  preamble.forEach((event, index) => events.push({ ...event, id: `evt_${size}_pre_${index}`, session_id: id, timestamp: at(0) }));
  for (let index = 0; events.length < size - 1; index += 1) {
    const template = actions[index % actions.length];
    const call = template.correlation_id === null ? null : `call_${size}_${index}`;
    events.push({ ...template, id: `evt_${size}_${index}`, session_id: id, correlation_id: call, timestamp: at(index + 1) });
  }
  events.push({ ...end, id: `evt_${size}_end`, session_id: id, timestamp: at(size) });
  return { id, events };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function time(dbPath, label, run) {
  const { service, store } = new ServiceAssembly().open(dbPath);
  const samples = [];
  let result;
  try {
    for (let index = 0; index < RUNS; index += 1) {
      const started = performance.now();
      result = await run(service);
      samples.push(performance.now() - started);
    }
  } finally {
    store.close();
  }
  const [cold, ...warm] = samples;
  const out = { cold: cold.toFixed(0), warm: warm.length === 0 ? "-" : median(warm).toFixed(0), result };
  console.error(`  ${label}: cold ${out.cold} ms, warm ${out.warm} ms`);
  return out;
}

const sizes = process.argv.slice(2).map(Number).filter((size) => size > 0);
const rows = [];
for (const size of sizes.length > 0 ? sizes : [1000, 10000, 50000]) {
  console.error(`${size} events`);
  const dbPath = join(mkdtempSync(join(tmpdir(), "tracevault-scale-")), "events.db");
  const { id, events } = session(size);
  const { store } = new ServiceAssembly().open(dbPath);
  for (const event of events) {
    store.append(event);
  }
  store.close();

  const timeline = await time(dbPath, "timeline", (service) => service.getTimeline(id));
  const findings = await time(dbPath, "findings", (service) => service.getFindings(id));
  const configFindings = await time(dbPath, "config findings", (service) => service.getConfigFindings(id));
  const report = await time(dbPath, "report", (service) => new ReportView().render(service, id));
  const page = await time(dbPath, "session page", async (service) => {
    const server = new DashboardServer(service, new SessionListView(), new TimelineView(), new ActivityView(), undefined, new SessionPageView(new SessionHeaderView(), panes, new DetailPaneView()));
    try {
      return await (await fetch(`http://127.0.0.1:${await server.listen(0)}/sessions/${id}`)).text();
    } finally {
      await server.close();
    }
  });

  const database = new DatabaseSync(dbPath);
  const byType = database.prepare("SELECT type, COUNT(*) AS n, SUM(LENGTH(body)) AS bytes FROM events GROUP BY type").all();
  const fileBefore = statSync(dbPath).size;
  database.exec("VACUUM");
  database.close();
  const bodyBytes = byType.reduce((sum, row) => sum + Number(row.bytes), 0);
  const meta = byType.filter((row) => row.type === "config.snapshot" || row.type === "mcp.tools").reduce((sum, row) => sum + Number(row.bytes), 0);

  rows.push({
    events: size,
    timelineMs: `${timeline.cold} / ${timeline.warm}`,
    findingsMs: `${findings.cold} / ${findings.warm}`,
    findings: findings.result.length,
    configMs: `${configFindings.cold} / ${configFindings.warm}`,
    pageMs: `${page.cold} / ${page.warm}`,
    pageKB: (page.result.length / 1024).toFixed(0),
    reportMs: `${report.cold} / ${report.warm}`,
    reportKB: (report.result.length / 1024).toFixed(0),
    bytesPerEvent: Math.round(bodyBytes / size),
    preambleKB: (meta / 1024).toFixed(1),
    fileKB: (fileBefore / 1024).toFixed(0),
    vacuumedKB: (statSync(dbPath).size / 1024).toFixed(0),
  });
}

console.log(`node ${process.version} · ${platform()} ${arch()} · ${cpus()[0]?.model ?? "unknown cpu"} × ${cpus().length} · ${(totalmem() / 2 ** 30).toFixed(0)} GiB · cold / warm (median of ${RUNS - 1}) ms`);
console.table(rows);
