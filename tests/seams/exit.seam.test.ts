import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HookPayloadParser } from "../../src/capture/HookPayloadParser.js";
import { PayloadDigest } from "../../src/capture/PayloadDigest.js";
import { PluginHookCapture } from "../../src/capture/PluginHookCapture.js";
import { ToolClassifier } from "../../src/capture/ToolClassifier.js";
import { WorkflowScannerAssembly } from "../../src/cli/WorkflowScannerAssembly.js";
import { ActivityView } from "../../src/dashboard/ActivityView.js";
import { DashboardServer } from "../../src/dashboard/DashboardServer.js";
import { DetailPaneView } from "../../src/dashboard/DetailPaneView.js";
import { FindingsPanelView } from "../../src/dashboard/FindingsPanelView.js";
import { SessionHeaderView } from "../../src/dashboard/SessionHeaderView.js";
import { SessionListView } from "../../src/dashboard/SessionListView.js";
import { SessionPageView } from "../../src/dashboard/SessionPageView.js";
import { TimelineView } from "../../src/dashboard/TimelineView.js";
import type { Event } from "../../src/schema/Event.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { SessionFindings } from "../../src/service/SessionFindings.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

const RULES = join(import.meta.dirname, "../../rules");
const EXIT = join(import.meta.dirname, "../fixtures/rules/phase-2-exit");

interface ExitRun {
  readonly source: "recorded" | "authored";
  readonly events: readonly Event[];
}

function run(name: "trigger" | "clean"): ExitRun {
  return JSON.parse(readFileSync(join(EXIT, `${name}.json`), "utf8")) as ExitRun;
}

describe("Phase 2 exit: the scripted session, frozen", () => {
  const scanner = new WorkflowScannerAssembly().fromDirectory(RULES);

  it("uses nonempty recorded sessions for both exit runs", () => {
    for (const name of ["trigger", "clean"] as const) {
      const fixture = run(name);
      expect(fixture.source, name).toBe("recorded");
      expect(fixture.events.length, name).toBeGreaterThan(0);
    }
  });

  it("trips at least three distinct rules on the scripted session", () => {
    const ruleIds = new Set(scanner.scan(run("trigger").events).map((finding) => finding.ruleId));

    expect(ruleIds.size).toBeGreaterThanOrEqual(3);
  });

  it("resolves every finding to a rule and to events inside the session", () => {
    const trigger = run("trigger");
    const ids = new Set(trigger.events.map((event) => event.id));
    const findings = scanner.scan(trigger.events);

    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.ruleId.length).toBeGreaterThan(0);
      expect(finding.eventIds.length).toBeGreaterThan(0);
      expect(finding.eventIds.every((id) => ids.has(id)), finding.ruleId).toBe(true);
    }
  });

  it("finds nothing in the clean session", () => {
    expect(scanner.scan(run("clean").events)).toEqual([]);
  });
});

describe("Phase 2 exit: the scripted session on the page", () => {
  let directory: string;
  let store: SqliteEventStore;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-exit-"));
    store = new SqliteEventStore(join(directory, "events.db"));
    const factory = new EventFactory();
    const service = new InvestigationService(
      new PluginHookCapture(new HookPayloadParser(), new ToolClassifier(new PayloadDigest()), factory),
      store,
      factory,
      new TimelineBuilder(),
      new SessionFindings(new WorkflowScannerAssembly().fromDirectory(RULES)),
    );
    const timelineView = new TimelineView();
    server = new DashboardServer(
      service,
      new SessionListView(),
      timelineView,
      new ActivityView(),
      undefined,
      new SessionPageView(new SessionHeaderView(), [new FindingsPanelView(), timelineView], new DetailPaneView()),
    );
    baseUrl = `http://127.0.0.1:${await server.listen(0)}`;
  });

  afterEach(async () => {
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("lists at least three rules and shows every flagged event as a row", async () => {
    const trigger = run("trigger");
    for (const event of trigger.events) {
      store.append(event);
    }
    const sessionId = trigger.events[0]?.session_id ?? "";

    const body = await (await fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionId)}`)).text();
    const panel = body.match(/<section class="findings"[\s\S]*?<\/section>/)?.[0] ?? "";
    const ruleIds = new Set([...panel.matchAll(/<li class="finding" data-rule="([^"]+)"/g)].map((match) => match[1]));
    const linked = [...panel.matchAll(/\?event=([^"&]+)/g)].map((match) => decodeURIComponent(match[1] ?? ""));

    expect(ruleIds.size).toBeGreaterThanOrEqual(3);
    expect(linked.length).toBeGreaterThan(0);
    for (const eventId of linked) {
      expect(body).toContain(`<li class="event" data-event-id="${eventId}"`);
    }
  });
});
