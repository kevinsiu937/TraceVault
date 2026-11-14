// Ticket 63: how often each workflow rule fires on real sessions, to find false positives.
// Run it on your own machine, against dist/ (npm run build first):
//   node docs/probes/scripts/false-positive-audit.mjs                 import your OpenCode history into a throwaway database
//   node docs/probes/scripts/false-positive-audit.mjs <events.db>     scan a copy of an existing TraceVault database (the original is never opened for writing)
//   add --show to also print, per finding, the actions behind it
// It prints counts by default. Command text appears only with --show, and only
// in this terminal: the script writes nothing into the repository, and the
// throwaway database lives in the system temp folder and is deleted at the end.
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const { SqliteEventStore } = await import(join(repo, "dist/store/SqliteEventStore.js"));
const { HistoryImportCommand } = await import(join(repo, "dist/cli/HistoryImportCommand.js"));
const { WorkflowScannerAssembly } = await import(join(repo, "dist/cli/WorkflowScannerAssembly.js"));
const { EventFacts } = await import(join(repo, "dist/schema/EventFacts.js"));

const args = process.argv.slice(2);
const show = args.includes("--show");
const given = args.find((arg) => !arg.startsWith("--"));
const scratch = mkdtempSync(join(tmpdir(), "tracevault-audit-"));
// Opening a database can migrate it, so a given database is scanned as a copy.
if (given !== undefined) copyFileSync(given, join(scratch, "events.db"));
const store = new SqliteEventStore(join(scratch, "events.db"));
try {
  if (given === undefined) {
    process.stdout.write(`${new HistoryImportCommand().run(store)}\n`);
  }
  const scanner = new WorkflowScannerAssembly().fromDirectory(join(repo, "rules"));
  const byRule = new Map();
  const sessions = store.listSessions();
  for (const { sessionId } of sessions) {
    const events = store.listBySession(sessionId);
    const targets = new Map(events.map((event) => [event.id, `${event.type} ${EventFacts.of(event).target}`]));
    for (const finding of scanner.scan(events)) {
      const entry = byRule.get(finding.ruleId) ?? { findings: 0, sessions: new Set(), examples: [] };
      entry.findings += 1;
      entry.sessions.add(sessionId);
      if (show) entry.examples.push({ sessionId, actions: finding.eventIds.map((id) => targets.get(id) ?? id) });
      byRule.set(finding.ruleId, entry);
    }
  }
  process.stdout.write(`\n${sessions.length} sessions scanned. Findings by rule:\n`);
  const rows = [...byRule].sort(([a], [b]) => a.localeCompare(b));
  for (const [rule, entry] of rows) {
    process.stdout.write(`  ${rule.padEnd(24)} ${String(entry.findings).padStart(5)} findings in ${entry.sessions.size} sessions\n`);
  }
  if (rows.length === 0) process.stdout.write("  none\n");
  if (show) {
    for (const [rule, entry] of rows) {
      process.stdout.write(`\n== ${rule}\n`);
      for (const example of entry.examples) {
        process.stdout.write(`  ${example.sessionId}\n${example.actions.map((action) => `    ${action.split("\n")[0].slice(0, 160)}`).join("\n")}\n`);
      }
    }
  }
  process.stdout.write("\nShare only the counts above. With --show, read the actions here and note which findings are wrong.\n");
} finally {
  store.close();
  rmSync(scratch, { recursive: true, force: true });
}
