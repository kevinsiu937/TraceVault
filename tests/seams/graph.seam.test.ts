import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HookPayloadParser } from "../../src/capture/HookPayloadParser.js";
import { PayloadDigest } from "../../src/capture/PayloadDigest.js";
import { PluginHookCapture } from "../../src/capture/PluginHookCapture.js";
import { ToolClassifier } from "../../src/capture/ToolClassifier.js";
import { ActivityView } from "../../src/dashboard/ActivityView.js";
import { DashboardServer } from "../../src/dashboard/DashboardServer.js";
import { DetailPaneView } from "../../src/dashboard/DetailPaneView.js";
import { FileRailView } from "../../src/dashboard/FileRailView.js";
import { GraphView } from "../../src/dashboard/GraphView.js";
import { SessionHeaderView } from "../../src/dashboard/SessionHeaderView.js";
import { SessionListView } from "../../src/dashboard/SessionListView.js";
import { SessionPageView } from "../../src/dashboard/SessionPageView.js";
import { TimelineView } from "../../src/dashboard/TimelineView.js";
import { WaterfallView } from "../../src/dashboard/WaterfallView.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

const SESSION = "ses_graph";

function toolAfter(
  tool: string,
  args: Record<string, unknown>,
  callID: string,
): Record<string, unknown> {
  return {
    hook: "tool.execute.after",
    input: { tool, sessionID: SESSION, callID, args },
    output: { title: "t", metadata: { truncated: false } },
  };
}

function toolFailed(
  tool: string,
  args: Record<string, unknown>,
  callID: string,
  error: string,
): Record<string, unknown> {
  return { hook: "tool.failed", input: { tool, sessionID: SESSION, callID, args }, error };
}

function nodeTags(body: string): string[] {
  return [...body.matchAll(/<a class="graph-node[^"]*"[^>]*>/g)].map((match) => match[0]);
}

function edgeTags(body: string): string[] {
  return [...body.matchAll(/<svg class="graph-edge[^"]*"[^>]*>/g)].map((match) => match[0]);
}

function attribute(tag: string, name: string): string {
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
}

describe("seam A: the graph view", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;
  let clock: number;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-graph-"));
    store = new SqliteEventStore(join(directory, "events.db"));
    const factory = new EventFactory();
    const capture = new PluginHookCapture(
      new HookPayloadParser(),
      new ToolClassifier(new PayloadDigest()),
      factory,
    );
    service = new InvestigationService(capture, store, factory, new TimelineBuilder());
    const timelineView = new TimelineView();
    server = new DashboardServer(
      service,
      new SessionListView(),
      timelineView,
      new ActivityView(),
      undefined,
      new SessionPageView(
        new SessionHeaderView(),
        [new FileRailView(), timelineView, new WaterfallView(), new GraphView()],
        new DetailPaneView(),
      ),
    );
    baseUrl = `http://127.0.0.1:${await server.listen(0)}`;
    clock = Date.UTC(2026, 9, 25, 10, 0, 0);
  });

  afterEach(async () => {
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function record(payload: Record<string, unknown>): void {
    service.recordHookPayload(payload, new Date(clock));
    clock += 1000;
  }

  function seedThreeKinds(): void {
    record(toolAfter("bash", { command: "ls" }, "call_hook"));
    record(toolAfter("read", { filePath: "src/a.ts" }, "call_doc"));
    record(toolAfter("github_search", { query: "trace" }, "call_mcp"));
  }

  // 85 events, four long runs: 40 shell, 30 file (4 failed), 6 MCP, 9 file.
  function seedLongRuns(): void {
    for (let index = 0; index < 40; index += 1) {
      record(toolAfter("bash", { command: `echo ${index}` }, `call_hook_${index}`));
    }
    for (let index = 0; index < 30; index += 1) {
      const filePath = `src/file-${index}.ts`;
      const failed = index >= 10 && index < 14;
      record(
        failed
          ? toolFailed("read", { filePath }, `call_doc_${index}`, "File not found")
          : toolAfter("read", { filePath }, `call_doc_${index}`),
      );
    }
    for (let index = 0; index < 6; index += 1) {
      record(toolAfter("github_search", { query: `q${index}` }, `call_mcp_${index}`));
    }
    for (let index = 0; index < 9; index += 1) {
      record(toolAfter("write", { filePath: `src/out-${index}.ts` }, `call_write_${index}`));
    }
  }

  it("switches the centre pane to the graph and drops the list rows", async () => {
    seedThreeKinds();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?view=graph`)).text();

    expect(body).toContain('aria-current="true">Graph</a>');
    expect(nodeTags(body).map((tag) => attribute(tag, "data-kind"))).toEqual([
      "hook.script",
      "document.access",
      "mcp.call",
    ]);
    expect(body).not.toContain('class="event-row');
  });

  it("collapses 85 events into four runs with the right counts", async () => {
    seedLongRuns();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?view=graph`)).text();
    const nodes = nodeTags(body);

    expect(nodes.length).toBeLessThanOrEqual(10);
    expect(nodes.map((tag) => attribute(tag, "data-kind"))).toEqual([
      "hook.script",
      "document.access",
      "mcp.call",
      "document.access",
    ]);
    expect(nodes.map((tag) => attribute(tag, "data-count"))).toEqual(["40", "30", "6", "9"]);
    expect(body).toContain('<span class="graph-count">×40</span>');
    expect(body).toContain('<span class="graph-count">×30</span>');
  });

  it("paints only the failing run's outgoing edge red", async () => {
    seedLongRuns();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?view=graph`)).text();
    const nodes = nodeTags(body);
    const edges = edgeTags(body);
    const failing = nodes.filter((tag) => Number(attribute(tag, "data-errors")) > 0);

    expect(failing).toHaveLength(1);
    expect(attribute(failing[0] ?? "", "data-kind")).toBe("document.access");
    expect(attribute(failing[0] ?? "", "data-errors")).toBe("4");
    expect(body).toContain('<span class="graph-errors">4 errors</span>');
    expect(edges).toHaveLength(nodes.length - 1);
    expect(edges.map((tag) => tag.includes("graph-edge-error"))).toEqual([false, true, false]);
  });

  it("links a node to the list view at the run's first event", async () => {
    seedLongRuns();
    const first = service.getTimeline(SESSION)[0];
    expect(first).toBeDefined();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?view=graph`)).text();
    const rawHref = attribute(nodeTags(body)[0] ?? "", "href");
    const href = rawHref.replace(/&amp;/g, "&");

    expect(href).toBe(
      `/sessions/${SESSION}?view=list&event=${first?.eventId ?? ""}#event-${first?.eventId ?? ""}`,
    );
  });

  it("marks the run that holds the selected event as current", async () => {
    seedLongRuns();
    const selected = service.getTimeline(SESSION).find((entry) => entry.type === "mcp.call");
    expect(selected).toBeDefined();

    const body = await (
      await fetch(
        `${baseUrl}/sessions/${SESSION}?view=graph&event=${encodeURIComponent(selected?.eventId ?? "")}`,
      )
    ).text();
    const current = nodeTags(body).filter((tag) => tag.includes('aria-current="true"'));

    expect(current).toHaveLength(1);
    expect(attribute(current[0] ?? "", "data-kind")).toBe("mcp.call");
  });

  it("keeps a calm empty state when the filter leaves nothing to graph", async () => {
    seedThreeKinds();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}?view=graph&kind=skill.call`)).text();

    expect(nodeTags(body)).toHaveLength(0);
    expect(body).toContain("No events to graph in this session.");
  });
});
