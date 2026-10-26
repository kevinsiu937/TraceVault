import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HookPayloadParser } from "../../src/capture/HookPayloadParser.js";
import { PayloadDigest } from "../../src/capture/PayloadDigest.js";
import { PluginHookCapture } from "../../src/capture/PluginHookCapture.js";
import { ToolClassifier } from "../../src/capture/ToolClassifier.js";
import { ActivityView } from "../../src/dashboard/ActivityView.js";
import { DashboardServer } from "../../src/dashboard/DashboardServer.js";
import { SessionListView } from "../../src/dashboard/SessionListView.js";
import { TimelineView } from "../../src/dashboard/TimelineView.js";
import { PendingGapStore } from "../../src/plugin/PendingGapStore.js";
import { TraceVaultPlugin } from "../../src/plugin/TraceVaultPlugin.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

const GAP_REASON = "capture endpoint unavailable";
const GAP_FIXTURE = new URL("../fixtures/capture-gap-service-down.json", import.meta.url);
const GAP_FROM = "2026-10-25T10:00:01.000Z";
const GAP_TO = "2026-10-25T10:05:00.000Z";

function toolAfter(sessionID: string, callID: string): unknown {
  return {
    hook: "tool.execute.after",
    input: { tool: "read", sessionID, callID, args: { filePath: "a.ts" } },
    output: { title: "t", metadata: {} },
  };
}

function captureGap(sessionID: string): unknown {
  return { hook: "capture.gap", sessionID, from: GAP_FROM, to: GAP_TO, reason: GAP_REASON };
}

describe("seam B: a gap is stamped at the end of the uncovered interval", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-gap-seam-b-"));
    store = new SqliteEventStore(join(directory, "events.db"));
    const factory = new EventFactory();
    const capture = new PluginHookCapture(
      new HookPayloadParser(),
      new ToolClassifier(new PayloadDigest()),
      factory,
    );
    service = new InvestigationService(capture, store, factory, new TimelineBuilder());
  });

  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("keeps the recorded service-down interval intact", () => {
    const payload = JSON.parse(readFileSync(GAP_FIXTURE, "utf8")) as { from: string; to: string };
    service.recordHookPayload(payload, new Date("2026-10-26T14:20:00.000Z"));

    const [event] = store.listBySession("ses_fixture_outage");
    expect(event?.type).toBe("capture.gap");
    expect(event?.timestamp).toBe(payload.to);
    expect(event?.data).toMatchObject({ from: payload.from, to: payload.to, reason: GAP_REASON });
  });

  it("stores the gap at its to time and places it between the outage edges", () => {
    service.recordHookPayload(toolAfter("ses_gap", "call_before"), new Date("2026-10-25T10:00:00.000Z"));
    service.recordHookPayload(captureGap("ses_gap"), new Date("2026-10-25T10:06:00.000Z"));
    service.recordHookPayload(toolAfter("ses_gap", "call_after"), new Date("2026-10-25T10:07:00.000Z"));

    const gap = store.listBySession("ses_gap").find((event) => event.type === "capture.gap");
    expect(gap?.timestamp).toBe(GAP_TO);
    expect(gap?.data).toEqual({
      capture_path: "plugin_hook",
      from: GAP_FROM,
      to: GAP_TO,
      reason: GAP_REASON,
    });
    expect(service.getTimeline("ses_gap").map((entry) => entry.type)).toEqual([
      "document.access",
      "capture.gap",
      "document.access",
    ]);
  });
});

describe("seam A: an uncovered session is visible as uncovered", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-gap-seam-a-"));
    store = new SqliteEventStore(join(directory, "events.db"));
    const factory = new EventFactory();
    const capture = new PluginHookCapture(
      new HookPayloadParser(),
      new ToolClassifier(new PayloadDigest()),
      factory,
    );
    service = new InvestigationService(capture, store, factory, new TimelineBuilder());
    server = new DashboardServer(service, new SessionListView(), new TimelineView(), new ActivityView());
    baseUrl = `http://127.0.0.1:${await server.listen(0)}`;
  });

  afterEach(async () => {
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("labels a gap-only session uncovered and shows the reason on its page", async () => {
    service.recordHookPayload(captureGap("ses_gap_only"), new Date("2026-10-25T10:06:00.000Z"));

    const list = await (await fetch(`${baseUrl}/`)).text();
    expect(list).toContain('<span class="pill gap">uncovered</span>');

    const page = await (await fetch(`${baseUrl}/sessions/ses_gap_only`)).text();
    expect(page).toContain(GAP_REASON);
  });

  it("keeps a session with no gap open", async () => {
    service.recordHookPayload(toolAfter("ses_clean", "call_clean"), new Date("2026-10-25T10:00:00.000Z"));

    const list = await (await fetch(`${baseUrl}/`)).text();
    expect(list).not.toContain("uncovered");
    expect(list).toContain(">open<");
  });
});

describe("plugin durability across processes", () => {
  let directory: string;
  let statePath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-gap-state-"));
    statePath = join(directory, "pending-gaps.json");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  // Kept here rather than at seam A or B: plugin-local durable state is hidden
  // from both. Seam A starts from a store and seam B from one hook payload; neither
  // carries a failed forward across two plugin instances.
  it("flushes the gap left by a previous plugin instance", async () => {
    const failing = {
      forward: async (): Promise<void> => {
        throw new Error("service down");
      },
    };
    const first = new TraceVaultPlugin(failing, new PendingGapStore(statePath));
    await first.hooks()["tool.execute.after"](
      { tool: "read", sessionID: "ses_outage", callID: "call_1", args: { filePath: "a.ts" } },
      {},
    );

    const recorded = new PendingGapStore(statePath).load();
    expect(recorded).toHaveLength(1);

    const sent: unknown[] = [];
    const succeeding = {
      forward: async (payload: unknown): Promise<void> => {
        sent.push(payload);
      },
    };
    const second = new TraceVaultPlugin(succeeding, new PendingGapStore(statePath));
    await second.hooks()["tool.execute.after"](
      { tool: "read", sessionID: "ses_next", callID: "call_2", args: { filePath: "b.ts" } },
      {},
    );

    const gaps = sent.filter((payload) => (payload as { hook?: string }).hook === "capture.gap");
    expect(gaps).toEqual([
      {
        hook: "capture.gap",
        sessionID: "ses_outage",
        from: recorded[0]?.from,
        to: recorded[0]?.lastFailureAt,
        reason: GAP_REASON,
      },
    ]);
    expect(new PendingGapStore(statePath).load()).toEqual([]);
  });
});
