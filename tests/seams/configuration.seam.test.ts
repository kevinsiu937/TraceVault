import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
import { ConfigRuleLoader } from "../../src/scanner/static/ConfigRuleLoader.js";
import { StaticScanner } from "../../src/scanner/static/StaticScanner.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { SessionConfiguration } from "../../src/service/SessionConfiguration.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

type Hooks = ReturnType<TraceVaultPlugin["hooks"]>;

// Recorded 11 Nov 2026 (config-probe.sh): OpenCode had already substituted every {env:...} and {file:...} reference.
const recorded = JSON.parse(readFileSync(join(import.meta.dirname, "../fixtures/config-hook.json"), "utf8")) as {
  config: Record<string, unknown> & { permission: unknown; agent: unknown };
};
const FAKE_SECRETS = [
  "tvprobe-literal-FAKE-0001",
  "tvprobe-env-FAKE-0002",
  "tvprobe-file-FAKE-0003",
  "tvprobe-literal-FAKE-0004",
  "tvprobe-literal-FAKE-0005",
];
const SESSION = "ses_config_one";
const OTHER = "ses_config_two";

function created(sessionID: string): Parameters<Hooks["event"]>[0] {
  return { event: { type: "session.created", properties: { sessionID, info: { title: "Config", directory: "/home/dev/probe/workspace" } } } };
}

function idle(sessionID: string): Parameters<Hooks["event"]>[0] {
  return { event: { type: "session.idle", properties: { sessionID } } };
}

describe("seam B: the configuration a session ran under", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let sent: unknown[];
  let clock: number;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-config-"));
    store = new SqliteEventStore(join(directory, "events.db"));
    const factory = new EventFactory();
    service = new InvestigationService(
      new PluginHookCapture(new HookPayloadParser(), new ToolClassifier(new PayloadDigest()), factory),
      store,
      factory,
      new TimelineBuilder(),
    );
    sent = [];
    clock = Date.parse("2026-11-11T10:00:00.000Z");
  });

  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function hooks(forward: (payload: unknown) => Promise<void> = async (payload) => void sent.push(payload)): Hooks {
    return new TraceVaultPlugin({ forward }, new PendingGapStore(join(directory, "pending-gaps.json")), () => 0).hooks();
  }

  function record(): void {
    for (const payload of sent.splice(0)) {
      clock += 1000;
      expect(service.recordHookPayload(payload, new Date(clock))).toBe("stored");
    }
  }

  function types(sessionId: string): string[] {
    return store.listBySession(sessionId).map((event) => event.type);
  }

  it("stores the configuration as the session's first event, with every secret replaced", async () => {
    const plugin = hooks();
    await plugin.config(structuredClone(recorded.config));
    await plugin.event(created(SESSION));
    record();

    const [snapshot, start] = store.listBySession(SESSION);
    expect(start?.type).toBe("session.start");
    expect(snapshot).toMatchObject({
      type: "config.snapshot",
      correlation_id: null,
      data: {
        digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        config: {
          permission: recorded.config.permission,
          agent: recorded.config.agent,
          provider: {
            "tvprobe-literal": { options: { apiKey: "[redacted]" } },
            "tvprobe-env": { options: { apiKey: "[redacted]" } },
            "tvprobe-file": { options: { apiKey: "[redacted]" } },
          },
          mcp: {
            "tvprobe-local": {
              command: ["node", "-e", "process.exit(0)"],
              environment: { GITHUB_TOKEN: "[redacted]", LITERAL_TOKEN: "[redacted]" },
            },
            "tvprobe-remote": { url: "http://127.0.0.1:9/mcp", headers: { Authorization: "[redacted]" } },
          },
        },
      },
    });
  });

  it("never lets a secret leave the plugin or reach the database file", async () => {
    const plugin = hooks();
    await plugin.config(structuredClone(recorded.config));
    await plugin.event(created(SESSION));
    const leaving = JSON.stringify(sent);
    record();
    store.close();
    const files = ["events.db", "events.db-wal"].map((file) => join(directory, file)).filter((file) => existsSync(file));
    const bytes = files.map((file) => readFileSync(file, "latin1")).join("");
    store = new SqliteEventStore(join(directory, "events.db"));

    expect(JSON.stringify(recorded.config)).toContain(FAKE_SECRETS[0]);
    for (const secret of FAKE_SECRETS) {
      expect(leaving).not.toContain(secret);
      expect(bytes).not.toContain(secret);
    }
  });

  it("sends the configuration once to each session the process sees, before that session's first event", async () => {
    const plugin = hooks();
    await plugin.config(structuredClone(recorded.config));
    await plugin.event(created(SESSION));
    await plugin.event(idle(SESSION));
    await plugin.event(created(OTHER));
    record();

    expect(types(SESSION)).toEqual(["config.snapshot", "session.start", "session.end"]);
    expect(types(OTHER)).toEqual(["config.snapshot", "session.start"]);
  });

  it("gives a session resumed in a new process that process's configuration", async () => {
    const first = hooks();
    await first.config(structuredClone(recorded.config));
    await first.event(created(SESSION));
    const second = hooks();
    await second.config({ ...structuredClone(recorded.config), permission: { bash: "deny" } });
    await second.event(idle(SESSION));
    record();

    const permissions = store
      .listBySession(SESSION)
      .flatMap((event) => (event.type === "config.snapshot" ? [event.data.config["permission"]] : []));
    expect(permissions).toEqual([recorded.config.permission, { bash: "deny" }]);
  });

  it("sends the configuration again after a failed attempt, and only once it got through", async () => {
    let down = true;
    const plugin = hooks(async (payload) => {
      if (down) {
        throw new Error("service down");
      }
      sent.push(payload);
    });
    await plugin.config(structuredClone(recorded.config));
    await plugin.event(created(SESSION));
    down = false;
    await plugin.event(idle(SESSION));
    await plugin.event(idle(SESSION));
    record();

    expect(types(SESSION).filter((type) => type === "config.snapshot")).toHaveLength(1);
  });

  it("does not send the configuration twice when only the event after it failed", async () => {
    let refusals = 1;
    const plugin = hooks(async (payload) => {
      if ((payload as { hook?: string }).hook === "session.created" && refusals-- > 0) {
        throw new Error("service hiccup");
      }
      sent.push(payload);
    });
    await plugin.config(structuredClone(recorded.config));
    await plugin.event(created(SESSION));
    await plugin.event(idle(SESSION));
    record();

    expect(types(SESSION).filter((type) => type === "config.snapshot")).toHaveLength(1);
  });

  it("records a gap instead of a configuration it cannot read, without failing OpenCode's hook", async () => {
    const cyclic: Record<string, unknown> = { permission: { bash: "ask" } };
    cyclic["self"] = cyclic;
    const plugin = hooks();

    await expect(plugin.config(cyclic)).resolves.toBeUndefined();
    await plugin.event(created(SESSION));
    record();

    const events = store.listBySession(SESSION);
    expect(events.map((event) => event.type).sort()).toEqual(["capture.gap", "session.start"]);
    expect(events.find((event) => event.type === "capture.gap")?.data).toMatchObject({
      reason: expect.stringMatching(/^configuration could not be recorded: /),
    });
  });
});

describe("seam A: the Configuration view", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-config-view-"));
    store = new SqliteEventStore(join(directory, "events.db"));
    const factory = new EventFactory();
    service = new InvestigationService(
      new PluginHookCapture(new HookPayloadParser(), new ToolClassifier(new PayloadDigest()), factory),
      store,
      factory,
      new TimelineBuilder(),
      undefined,
      new SessionConfiguration(new StaticScanner(new ConfigRuleLoader().loadDirectory(join(import.meta.dirname, "../../rules/config")))),
    );
    server = new DashboardServer(service, new SessionListView(), new TimelineView(), new ActivityView());
    baseUrl = `http://127.0.0.1:${await server.listen(0)}`;
  });

  afterEach(async () => {
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function seedWithConfiguration(config: Record<string, unknown> = recorded.config): Promise<void> {
    const sent: unknown[] = [];
    const plugin = new TraceVaultPlugin(
      { forward: async (payload: unknown): Promise<void> => void sent.push(payload) },
      new PendingGapStore(join(directory, "pending-gaps.json")),
      () => 0,
    ).hooks();
    await plugin.config(structuredClone(config));
    await plugin.event(created(SESSION));
    await plugin["tool.execute.after"](
      { tool: "read", sessionID: SESSION, callID: "call_read", args: { filePath: "/home/dev/probe/workspace/README.md" } },
      { title: "README.md", metadata: {} },
    );
    let at = Date.parse("2026-11-11T10:00:00.000Z");
    for (const payload of sent) {
      at += 1000;
      service.recordHookPayload(payload, new Date(at));
    }
  }

  it("shows the recorded configuration with secrets only as references, linked from the session header", async () => {
    await seedWithConfiguration();

    const session = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    const response = await fetch(`${baseUrl}/sessions/${SESSION}/config`);
    const page = await response.text();

    expect(session).toContain(`href="/sessions/${SESSION}/config"`);
    expect(response.status).toBe(200);
    expect(page).toContain("<h1>Configuration</h1>");
    expect(page).toContain(`href="/sessions/${SESSION}"`);
    expect(page).toContain("GITHUB_TOKEN");
    expect(page).toContain("opencode.json");
    expect(page).toContain("[redacted]");
    expect(page).toMatch(/sha256:[0-9a-f]{64}/);
    for (const secret of FAKE_SECRETS) {
      expect(page).not.toContain(secret);
    }
  });

  it("lists each static finding with its rule, source, agent and entry, and counts them in the session header", async () => {
    await seedWithConfiguration();

    const session = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    const page = await (await fetch(`${baseUrl}/sessions/${SESSION}/config`)).text();
    const finding = page.match(/<li class="config-finding" data-rule="shell-unrestricted"[\s\S]*?<\/ul><\/li>/)?.[0] ?? "";
    const count = page.match(/<li class="config-finding"/g)?.length ?? 0;

    expect(count).toBeGreaterThan(1);
    expect(session).toContain(`Configuration · ${count} findings<`);
    expect(finding).toContain('data-rule="shell-unrestricted"');
    expect(finding).toContain(">high<");
    expect(finding).toContain("OWASP Agentic ASI05 Unexpected Code Execution");
    expect(finding).toContain("<code>build</code>");
    expect(finding).toContain("<code>/agent/build/permission/bash</code>");
    expect(finding).toContain("<code>rm -rf /</code>");
    expect(finding).toContain('<p class="config-recommendation">What to do: Make the agent ask before it runs commands');
  });

  it("says when a finding comes from OpenCode's defaults rather than the configuration", async () => {
    await seedWithConfiguration({});

    const page = await (await fetch(`${baseUrl}/sessions/${SESSION}/config`)).text();

    expect(page.match(/<li class="config-finding" data-rule="shell-unrestricted"/g)).toHaveLength(4);
    expect(page).toContain("OpenCode default");
  });

  it("names the credentials an MCP server receives, never their values", async () => {
    await seedWithConfiguration({
      permission: { bash: "ask", webfetch: "deny", edit: "ask" },
      mcp: { github: { type: "local", command: ["npx", "server-github"], environment: { GITHUB_TOKEN: "tvview-FAKE-0301" } } },
    });

    const page = await (await fetch(`${baseUrl}/sessions/${SESSION}/config`)).text();
    const finding = page.match(/<li class="config-finding" data-rule="mcp-holds-credentials"[\s\S]*?<\/ul><\/li>/)?.[0] ?? "";

    expect(finding).toContain("OWASP MCP MCP01:2025 Token Mismanagement &amp; Secret Exposure");
    expect(finding).toContain("MCP server <code>github</code>");
    expect(finding).toContain("<code>GITHUB_TOKEN</code>, from <code>/mcp/github/environment/GITHUB_TOKEN</code>");
    expect(page).not.toContain("tvview-FAKE-0301");
  });

  it("keeps the configuration off the timeline and out of the event count", async () => {
    await seedWithConfiguration();

    const session = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    const list = await (await fetch(`${baseUrl}/`)).text();
    const row = list.match(new RegExp(`<tr data-session-id="${SESSION}">[\\s\\S]*?</tr>`))?.[0] ?? "";

    expect(session).not.toContain('data-kind="config.snapshot"');
    expect(session).toContain('<span class="stat-value">2</span> <span class="stat-label">events</span>');
    expect(row.match(/<td class="right mono">(\d+)<\/td>/)?.[1]).toBe("1");
  });

  it("never pushes the configuration to a live page as a row", async () => {
    service.recordHookPayload({ hook: "session.created", sessionID: SESSION, title: "Live" }, new Date("2026-11-11T09:59:00.000Z"));
    const controller = new AbortController();
    const reader = (await fetch(`${baseUrl}/sessions/${SESSION}/events`, { signal: controller.signal })).body?.getReader();

    await seedWithConfiguration();
    const snapshotId = store.listBySession(SESSION).find((event) => event.type === "config.snapshot")?.id;
    const readId = store.listBySession(SESSION).find((event) => event.type === "document.access")?.id;
    const received: string[] = [];
    const decoder = new TextDecoder();
    for (let attempt = 0; attempt < 20 && !received.includes(String(readId)); attempt += 1) {
      const chunk = await reader?.read();
      if (chunk === undefined || chunk.done) break;
      received.push(...[...decoder.decode(chunk.value).matchAll(/"eventId":"([^"]+)"/g)].map((match) => match[1] ?? ""));
    }
    controller.abort();

    expect(snapshotId).toBeDefined();
    expect(received).toContain(readId);
    expect(received).not.toContain(snapshotId);
  });

  it("shows the latest configuration when a resumed session recorded a second one", async () => {
    await seedWithConfiguration();
    const sent: unknown[] = [];
    const resumed = new TraceVaultPlugin(
      { forward: async (payload: unknown): Promise<void> => void sent.push(payload) },
      new PendingGapStore(join(directory, "pending-gaps.json")),
      () => 0,
    ).hooks();
    await resumed.config({ permission: { bash: "deny" } });
    await resumed.event(idle(SESSION));
    for (const payload of sent) {
      service.recordHookPayload(payload, new Date("2026-11-11T11:00:00.000Z"));
    }

    const page = await (await fetch(`${baseUrl}/sessions/${SESSION}/config`)).text();

    expect(page).toContain("&quot;bash&quot;: &quot;deny&quot;");
    expect(page).not.toContain("GITHUB_TOKEN");
  });

  it("says no configuration was recorded for a session without one", async () => {
    service.recordHookPayload({ hook: "session.created", sessionID: OTHER, title: "Imported" }, new Date("2026-11-11T09:00:00.000Z"));

    const page = await (await fetch(`${baseUrl}/sessions/${OTHER}/config`)).text();

    expect(page).toContain("No configuration recorded");
    expect(page).not.toContain("[redacted]");
  });

  it("answers 404 for the configuration of an unknown session", async () => {
    expect((await fetch(`${baseUrl}/sessions/ses_missing/config`)).status).toBe(404);
  });
});
