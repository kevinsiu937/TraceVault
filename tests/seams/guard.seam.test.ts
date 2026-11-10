import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HookPayloadParser } from "../../src/capture/HookPayloadParser.js";
import { PayloadDigest } from "../../src/capture/PayloadDigest.js";
import { PluginHookCapture } from "../../src/capture/PluginHookCapture.js";
import { ToolClassifier } from "../../src/capture/ToolClassifier.js";
import { GuardAssembly } from "../../src/cli/GuardAssembly.js";
import { WorkflowScannerAssembly } from "../../src/cli/WorkflowScannerAssembly.js";
import { ActivityView } from "../../src/dashboard/ActivityView.js";
import { DashboardServer } from "../../src/dashboard/DashboardServer.js";
import { DetailPaneView } from "../../src/dashboard/DetailPaneView.js";
import { FindingsPanelView } from "../../src/dashboard/FindingsPanelView.js";
import { SessionHeaderView } from "../../src/dashboard/SessionHeaderView.js";
import { SessionListView } from "../../src/dashboard/SessionListView.js";
import { SessionPageView } from "../../src/dashboard/SessionPageView.js";
import { TimelineView } from "../../src/dashboard/TimelineView.js";
import { CallGuard } from "../../src/plugin/CallGuard.js";
import { PendingGapStore } from "../../src/plugin/PendingGapStore.js";
import { TraceVaultPlugin } from "../../src/plugin/TraceVaultPlugin.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { SessionFindings } from "../../src/service/SessionFindings.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

const RULES = join(import.meta.dirname, "../../rules");
const RECEIVED_AT = new Date("2026-11-10T07:09:17.758Z");

type Hooks = ReturnType<TraceVaultPlugin["hooks"]>;
type BeforeInput = Parameters<Hooks["tool.execute.before"]>[0];
type PluginEvent = Parameters<Hooks["event"]>[0]["event"];

// Recorded 10 Nov 2026 (refusal-probe.sh run 2): a before hook that throws turns the call into an error part.
const recorded = JSON.parse(readFileSync(join(import.meta.dirname, "../fixtures/tool-refused-by-hook.json"), "utf8")) as {
  "tool.execute.before": { input: BeforeInput; output: { args: Record<string, unknown> } };
  event: PluginEvent & { properties: { part: { state: { error: string } } } };
};
const REFUSED = recorded["tool.execute.before"];
const SESSION = REFUSED.input.sessionID;

function call(tool: string, args: Record<string, unknown>, callID = `call_${tool}`): [BeforeInput, { args: Record<string, unknown> }] {
  return [{ tool, sessionID: SESSION, callID }, { args }];
}

describe("seam B: the opt-in guard refuses a call before it runs", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let sent: unknown[];

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-guard-"));
    store = new SqliteEventStore(join(directory, "events.db"));
    const factory = new EventFactory();
    service = new InvestigationService(
      new PluginHookCapture(new HookPayloadParser(), new ToolClassifier(new PayloadDigest()), factory),
      store,
      factory,
      new TimelineBuilder(),
      new SessionFindings(new WorkflowScannerAssembly().fromDirectory(RULES)),
    );
    sent = [];
  });

  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function hooks(guard: CallGuard | null = new GuardAssembly().fromDirectory(RULES)): Hooks {
    return new TraceVaultPlugin(
      { forward: async (payload: unknown): Promise<void> => void sent.push(payload) },
      new PendingGapStore(join(directory, "pending-gaps.json")),
      () => 0,
      guard,
    ).hooks();
  }

  function record(): void {
    for (const payload of sent.splice(0)) {
      expect(service.recordHookPayload(payload, RECEIVED_AT)).toBe("stored");
    }
  }

  /** What OpenCode does with a refused call: it reports the call as an error part carrying the thrown message. */
  async function refuse(plugin: Hooks, before: BeforeInput, args: Record<string, unknown>): Promise<string> {
    const message = await plugin["tool.execute.before"](before, { args }).then(
      () => "not refused",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    const event = structuredClone(recorded.event);
    Object.assign(event.properties.part, { tool: before.tool, callID: before.callID, sessionID: before.sessionID });
    Object.assign(event.properties.part.state, { input: args, error: message });
    await plugin.event({ event });
    record();
    return message;
  }

  it("refuses a write to opencode.json, and the timeline shows it denied and flagged by the rule that refused it", async () => {
    const message = await refuse(hooks(), REFUSED.input, REFUSED.output.args);

    expect(message).toMatch(/TraceVault blocked this call: .*'self-modification'/);
    const [stored] = store.listBySession(SESSION);
    expect(stored).toMatchObject({
      type: "document.access",
      correlation_id: REFUSED.input.callID,
      data: { path: REFUSED.output.args["filePath"], operation: "write", outcome: "denied", blocked_by: "self-modification" },
    });

    const server = new DashboardServer(
      service,
      new SessionListView(),
      new TimelineView(),
      new ActivityView(),
      undefined,
      new SessionPageView(new SessionHeaderView(), [new FindingsPanelView(), new TimelineView()], new DetailPaneView()),
    );
    try {
      const body = await (await fetch(`http://127.0.0.1:${await server.listen(0)}/sessions/${SESSION}`)).text();
      const row = body.match(new RegExp(`<li class="event" data-event-id="${stored?.id}"[\\s\\S]*?</a>`))?.[0] ?? "";
      expect(row).toContain('data-outcome="denied"');
      expect(row).toContain('<span class="flag" data-rule="self-modification"');
    } finally {
      await server.close();
    }
  });

  it("refuses a read of a sensitive file", async () => {
    const [before, { args }] = call("read", { filePath: "/home/dev/demo/.env" });
    const message = await refuse(hooks(), before, args);

    expect(message).toMatch(/'sensitive-read'/);
    expect(store.listBySession(SESSION)[0]?.data).toMatchObject({ outcome: "denied", blocked_by: "sensitive-read" });
  });

  it("lets an unprotected call through untouched", async () => {
    const [before, output] = call("edit", { filePath: "/home/dev/demo/src/app.ts", oldString: "a", newString: "b" });

    await expect(hooks()["tool.execute.before"](before, output)).resolves.toBeUndefined();
    expect(output.args).toEqual({ filePath: "/home/dev/demo/src/app.ts", oldString: "a", newString: "b" });
    expect(sent).toEqual([]);
  });

  it("never refuses anything with blocking off", async () => {
    await expect(hooks(null)["tool.execute.before"](REFUSED.input, REFUSED.output)).resolves.toBeUndefined();
    await expect(hooks(null)["tool.execute.before"](...call("read", { filePath: "/home/dev/demo/.env" }))).resolves.toBeUndefined();
    expect(sent).toEqual([]);
  });

  it.each([
    [
      "a rule set that does not load",
      (): CallGuard => {
        const broken = join(directory, "rules");
        mkdirSync(broken);
        writeFileSync(join(broken, "broken.yaml"), "id: [unclosed\n");
        return new GuardAssembly().fromDirectory(broken);
      },
      /rules did not load: broken\.yaml/,
    ],
    [
      "a guard that throws while deciding",
      (): CallGuard =>
        new CallGuard(
          () => ({
            scan: () => [],
            blockedBy: () => {
              throw new Error("matcher exploded");
            },
          }),
          new ToolClassifier(new PayloadDigest()),
          new EventFactory(),
        ),
      /matcher exploded/,
    ],
  ])("lets the call through on %s, and records a guard failure naming the call", async (_, guard, reason) => {
    const plugin = hooks(guard());

    await expect(plugin["tool.execute.before"](REFUSED.input, REFUSED.output)).resolves.toBeUndefined();
    await plugin["tool.execute.after"]({ ...REFUSED.input, args: REFUSED.output.args }, { title: "", metadata: {} });
    record();

    const events = store.listBySession(SESSION);
    expect(events.map((event) => event.type)).toEqual(["guard.failure", "document.access"]);
    expect(events[0]?.data).toEqual({ tool: "edit", call_id: REFUSED.input.callID, reason: expect.stringMatching(reason) });
    expect(events[1]?.data).toMatchObject({ outcome: "ok" });
  });

  it("stores a refused call as denied whatever error text OpenCode reports for it", () => {
    service.recordHookPayload(
      { hook: "tool.failed", input: { ...REFUSED.input, args: REFUSED.output.args }, error: "tool call failed", blockedBy: "self-modification" },
      RECEIVED_AT,
    );

    expect(store.listBySession(SESSION)[0]?.data).toMatchObject({ outcome: "denied", blocked_by: "self-modification" });
  });

  it("counts the guard's own refusals toward probing", async () => {
    const plugin = hooks();
    for (const id of ["call_one", "call_two", "call_three"]) {
      await refuse(plugin, { ...REFUSED.input, callID: id }, REFUSED.output.args);
    }

    const ruleIds = service.getFindings(SESSION).map((finding) => finding.ruleId);
    expect(ruleIds).toContain("probing");
  });
});
