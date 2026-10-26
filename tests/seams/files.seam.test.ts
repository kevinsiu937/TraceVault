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
import { SessionHeaderView } from "../../src/dashboard/SessionHeaderView.js";
import { SessionListView } from "../../src/dashboard/SessionListView.js";
import { SessionPageView } from "../../src/dashboard/SessionPageView.js";
import { TimelineView } from "../../src/dashboard/TimelineView.js";
import { WaterfallView } from "../../src/dashboard/WaterfallView.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

const SESSION = "ses_files";

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

function rail(body: string): string {
  const start = body.indexOf('<nav class="pane rail"');
  const end = body.indexOf("</nav>", start);
  return start < 0 || end < 0 ? "" : body.slice(start, end);
}

function groups(railHtml: string): string[] {
  return railHtml.split('<details class="file-group">').slice(1);
}

function group(railHtml: string, path: string): string {
  return groups(railHtml).find((candidate) => candidate.includes(`title="${path}"`)) ?? "";
}

describe("seam A: the file rail", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-files-"));
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
        [new FileRailView(), timelineView, new WaterfallView()],
        new DetailPaneView(),
      ),
    );
    baseUrl = `http://127.0.0.1:${await server.listen(0)}`;
  });

  afterEach(async () => {
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function seedThreeFiles(): void {
    service.recordHookPayload(
      { hook: "session.created", sessionID: SESSION, title: "Files" },
      new Date("2026-10-25T10:00:00.000Z"),
    );
    service.recordHookPayload(
      toolAfter("read", { filePath: "a.ts" }, "call_a_read"),
      new Date("2026-10-25T10:00:01.000Z"),
    );
    service.recordHookPayload(
      toolAfter("write", { filePath: "a.ts" }, "call_a_write"),
      new Date("2026-10-25T10:00:02.000Z"),
    );
    service.recordHookPayload(
      toolAfter("read", { filePath: "b.ts" }, "call_b"),
      new Date("2026-10-25T10:00:03.000Z"),
    );
    service.recordHookPayload(
      toolAfter("read", { filePath: "c.ts" }, "call_c"),
      new Date("2026-10-25T10:00:04.000Z"),
    );
    service.recordHookPayload(
      toolAfter("bash", { command: "ls -la" }, "call_shell"),
      new Date("2026-10-25T10:00:05.000Z"),
    );
  }

  it("lists every touched file once with its count, ordered by count then path", async () => {
    seedThreeFiles();
    const shell = service.getTimeline(SESSION).find((entry) => entry.type === "hook.script");

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    const railHtml = rail(body);

    expect(railHtml).toContain("Files · 3");
    expect(group(railHtml, "a.ts")).toContain('<span class="file-count">2</span>');
    expect(group(railHtml, "b.ts")).toContain('<span class="file-count">1</span>');
    expect(group(railHtml, "c.ts")).toContain('<span class="file-count">1</span>');
    expect(groups(railHtml)).toHaveLength(3);
    expect(railHtml.indexOf('title="a.ts"')).toBeLessThan(railHtml.indexOf('title="b.ts"'));
    expect(railHtml.indexOf('title="b.ts"')).toBeLessThan(railHtml.indexOf('title="c.ts"'));
    expect(railHtml).not.toContain("ls -la");
    expect(railHtml).not.toContain(shell?.eventId ?? "no-shell-event");
  });

  it("shows the last two path segments in the summary and the full path as title", async () => {
    service.recordHookPayload(
      toolAfter("read", { filePath: "src/vault/deep/notes.md" }, "call_long"),
      new Date("2026-10-25T10:00:01.000Z"),
    );

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    const railHtml = rail(body);
    const summary = railHtml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? "";

    expect(railHtml).toContain('title="src/vault/deep/notes.md"');
    expect(summary).toContain("deep/notes.md");
    expect(summary).not.toContain("src/vault");
  });

  it("lists each ref with its time and operation and marks writes apart from reads", async () => {
    seedThreeFiles();

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    const railHtml = rail(body);
    const a = group(railHtml, "a.ts");

    expect(a).toContain("10:00:01");
    expect(a).toContain("10:00:02");
    expect(a).toContain('class="file-ref op-read"');
    expect(a).toContain('class="file-ref op-write"');
    expect(a).toContain(">read<");
    expect(a).toContain(">write<");
  });

  it("links a ref to the list view at the event fragment", async () => {
    seedThreeFiles();
    const read = service
      .getTimeline(SESSION)
      .find((entry) => entry.target === "a.ts" && entry.operation === "read");

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    const railHtml = rail(body);
    const href = railHtml.match(/<a class="file-ref[^"]*" href="([^"]+)"/)?.[1] ?? "";

    expect(read).toBeDefined();
    expect(href).toContain(`event=${read?.eventId ?? ""}`);
    expect(href).toContain(`#event-${read?.eventId ?? ""}`);
    expect(href).toContain(`/sessions/${SESSION}`);
  });

  it("caps a busy file at eight refs and says how many more there are", async () => {
    for (let index = 0; index < 9; index += 1) {
      service.recordHookPayload(
        toolAfter("read", { filePath: "hot.ts" }, `call_hot_${index}`),
        new Date(`2026-10-25T10:00:0${index}.000Z`),
      );
    }

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    const hot = group(rail(body), "hot.ts");

    expect(hot).toContain('<span class="file-count">9</span>');
    expect((hot.match(/<a class="file-ref/g) ?? []).length).toBe(8);
    expect(hot).toContain("+1 more");
  });

  it("keeps a calm empty state when no file was touched", async () => {
    service.recordHookPayload(
      { hook: "session.created", sessionID: SESSION, title: "Nothing" },
      new Date("2026-10-25T10:00:00.000Z"),
    );

    const body = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();

    expect(rail(body)).toContain('<p class="pane-empty">No files touched in this session.</p>');
  });
});
