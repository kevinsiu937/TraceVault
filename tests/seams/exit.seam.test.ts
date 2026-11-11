import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
const FIXTURES = join(import.meta.dirname, "../fixtures");
const EXIT = join(FIXTURES, "rules/phase-2-exit");

interface ExitRun {
  readonly source: "recorded" | "authored";
  readonly events: readonly Event[];
}

function run(name: "trigger" | "clean"): ExitRun {
  return JSON.parse(readFileSync(join(EXIT, `${name}.json`), "utf8")) as ExitRun;
}

describe.each(["permission-probe.sh", "phase-2-exit-run.sh", "refusal-probe.sh", "subagent-probe.sh", "config-probe.sh"])("probe output safety: %s", (script) => {
  let directory: string;
  let output: string;
  let bin: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault probe-"));
    output = join(directory, "output");
    bin = join(directory, "bin");
    mkdirSync(bin);
    for (const command of ["node", "curl", "opencode"]) {
      writeFileSync(join(bin, command), "#!/bin/sh\necho 'probe execution reached' >&2\nexit 77\n", { mode: 0o755 });
    }
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  function launch() {
    return spawnSync("sh", [join(import.meta.dirname, "../../docs/probes/scripts", script), output], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env["PATH"] ?? ""}`, OPENCODE: join(bin, "opencode") },
      timeout: 5000,
    });
  }

  it.each(["workspace/keep.txt", ".keep", "events.db"])("refuses an output directory containing %s without changing it", (file) => {
    const marker = join(output, file);
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, "keep this existing data\n");
    const before = readdirSync(output).sort();

    const result = launch();

    expect(existsSync(marker) ? readFileSync(marker, "utf8") : "missing file").toBe("keep this existing data\n");
    expect(readdirSync(output).sort()).toEqual(before);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("empty directory");
    expect(result.stderr).not.toContain("probe execution reached");
  });

  it("refuses an output directory containing a dangling symlink without changing it", () => {
    mkdirSync(output);
    symlinkSync("missing-target", join(output, ".keep"));

    const result = launch();

    expect(readlinkSync(join(output, ".keep"))).toBe("missing-target");
    expect(readdirSync(output)).toEqual([".keep"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("empty directory");
  });

  it.each(["new", "empty"])("starts in a %s output directory", (kind) => {
    if (kind === "empty") mkdirSync(output);

    const result = launch();

    expect(result.error).toBeUndefined();
    expect(result.stderr).toContain("probe execution reached");
    expect(existsSync(join(output, "workspace/opencode.json"))).toBe(true);
  });
});

describe("frozen fixtures", () => {
  const PLACEHOLDER_USERS = new Set(["dev", "example"]);
  const USER_FOLDER = /(?:\/Users\/|\/home\/|[A-Za-z]:(?:\\+|\/)Users(?:\\+|\/))([^\\/"'\s]+)/g;

  it("name no user folder except the placeholders dev and example", () => {
    const leaks = readdirSync(FIXTURES, { recursive: true, encoding: "utf8" })
      .filter((file) => statSync(join(FIXTURES, file)).isFile())
      .flatMap((file) =>
        [...readFileSync(join(FIXTURES, file), "latin1").matchAll(USER_FOLDER)]
          .filter(([, user]) => !PLACEHOLDER_USERS.has((user ?? "").toLowerCase()))
          .map(([path]) => `${file}: ${path}`),
      );

    expect(leaks).toEqual([]);
  });
});

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
