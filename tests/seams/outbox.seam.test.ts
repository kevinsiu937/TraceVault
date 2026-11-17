import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ServiceAssembly } from "../../src/cli/ServiceAssembly.js";
import type { DashboardServer } from "../../src/dashboard/DashboardServer.js";
import { Outbox } from "../../src/plugin/Outbox.js";
import { PendingGapStore } from "../../src/plugin/PendingGapStore.js";
import { TraceVaultPlugin } from "../../src/plugin/TraceVaultPlugin.js";
import type { InvestigationService } from "../../src/service/InvestigationService.js";
import type { SqliteEventStore } from "../../src/store/SqliteEventStore.js";
import { StoreVerifier } from "../../src/store/StoreVerifier.js";

const SESSION = "ses_outbox";
// The service comes back long after the outage, so a late event stored at its arrival would sort last.
const BACK_AT = new Date("2099-01-01T00:00:00.000Z");

function toolAfter(callID: string, args: Record<string, unknown> = { filePath: `${callID}.ts` }): unknown {
  return { hook: "tool.execute.after", input: { tool: "read", sessionID: SESSION, callID, args }, output: { title: "t", metadata: {} } };
}

describe("seam B: the outbox keeps what the service could not take", () => {
  let directory: string;
  let outboxDir: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let up: boolean;
  let gaps: PendingGapStore;
  let arrived: string[];

  const forwarder = {
    forward: async (payload: unknown): Promise<void> => {
      if (!up) {
        throw new Error("service down");
      }
      expect(service.recordHookPayload(payload, BACK_AT)).not.toBe("rejected");
      arrived.push((payload as { input?: { callID?: string } }).input?.callID ?? (payload as { hook: string }).hook);
    },
  };

  function plugin(pid: number, alive: (pid: number) => boolean = () => false, dir: string = outboxDir): TraceVaultPlugin {
    return new TraceVaultPlugin(forwarder, gaps, () => 0, null, undefined, undefined, undefined, new Outbox(dir, pid, 1, alive));
  }

  function call(on: TraceVaultPlugin, callID: string, args?: Record<string, unknown>): Promise<void> {
    return on.hooks()["tool.execute.after"]({ tool: "read", sessionID: SESSION, callID, args: args ?? { filePath: `${callID}.ts` } }, {});
  }

  function outboxLines(): { payload: { observedAt: string; input?: { callID: string } } }[] {
    return readdirSync(outboxDir).flatMap((name) =>
      readFileSync(join(outboxDir, name), "utf8").split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line)),
    );
  }

  function storedCalls(): string[] {
    return store.listBySession(SESSION).flatMap((event) => (event.correlation_id === null ? [] : [event.correlation_id]));
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-outbox-"));
    outboxDir = join(directory, "outbox");
    gaps = new PendingGapStore(join(directory, "pending-gaps.json"));
    up = false;
    arrived = [];
    ({ service, store } = new ServiceAssembly().open(join(directory, "events.db")));
  });

  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("writes refused payloads to an owner-only outbox file", async () => {
    const tracevault = plugin(101);
    await call(tracevault, "call_1");
    await call(tracevault, "call_2");

    const files = readdirSync(outboxDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^101-1\b.*\.jsonl$/);
    expect(statSync(join(outboxDir, files[0] ?? "")).mode & 0o777).toBe(0o600);
    expect(outboxLines().map((line) => line.payload.input?.callID)).toEqual(["call_1", "call_2"]);
    expect(gaps.load()).toEqual([]);
  });

  it("stores the outbox in order, at the observed times, before the next payload", async () => {
    const tracevault = plugin(101);
    await call(tracevault, "call_1");
    await call(tracevault, "call_2");
    const observed = outboxLines().map((line) => line.payload.observedAt);

    up = true;
    await call(tracevault, "call_3");

    expect(storedCalls()).toEqual(["call_1", "call_2", "call_3"]);
    const events = store.listBySession(SESSION);
    expect(events.slice(0, 2).map((event) => event.timestamp)).toEqual(observed);
    expect(events.every((event) => event.timestamp !== BACK_AT.toISOString())).toBe(true);
    expect(readdirSync(outboxDir)).toEqual([]);
    expect(new StoreVerifier(store).verify()).toEqual({ ok: true });
  });

  it("drops the oldest payloads past 10 MB and records one gap over their times", async () => {
    const tracevault = plugin(101);
    const pad = "x".repeat(1_000_000);
    await call(tracevault, "call_0", { filePath: "a.ts", pad });
    const firstObserved = outboxLines()[0]?.payload.observedAt;
    for (let index = 1; index <= 10; index += 1) {
      await call(tracevault, `call_${index}`, { filePath: "a.ts", pad });
    }
    const size = readdirSync(outboxDir).reduce((total, name) => total + statSync(join(outboxDir, name)).size, 0);
    expect(size).toBeLessThanOrEqual(10 * 1024 * 1024);

    up = true;
    await call(tracevault, "call_after");

    const stored = storedCalls();
    expect(stored).not.toContain("call_0");
    expect(stored).toContain("call_10");
    const full = store.listBySession(SESSION).filter((event) => event.type === "capture.gap");
    expect(full).toHaveLength(1);
    expect(full[0]?.data).toMatchObject({ from: firstObserved, reason: "outbox full" });
  });

  async function outage(on: TraceVaultPlugin): Promise<string[]> {
    const calls = Array.from({ length: 12 }, (_, index) => `call_${index}`);
    for (const callID of calls) {
      await call(on, callID);
    }
    return calls;
  }

  it("keeps a long outage in at most two files per process", async () => {
    await outage(plugin(101));

    expect(readdirSync(outboxDir).length).toBeLessThanOrEqual(2);
  });

  it("sends another process's outbox in the order it was observed", async () => {
    const calls = await outage(plugin(101));

    up = true;
    await call(plugin(202), "call_next");

    expect(arrived.filter((callID) => callID !== "call_next")).toEqual(calls);
    expect(readdirSync(outboxDir)).toEqual([]);
  });

  it("covers every dropped payload with the gap when the oldest waiting file is smaller than what must go", async () => {
    const tracevault = plugin(101);
    await call(tracevault, "call_small_1");
    await call(tracevault, "call_small_2");
    const pad = "x".repeat(3_000_000);
    await call(tracevault, "call_big_1", { filePath: "a.ts", pad });
    const bigObserved = outboxLines().find((line) => line.payload.input?.callID === "call_big_1")?.payload.observedAt ?? "";
    for (let index = 2; index <= 4; index += 1) {
      await call(tracevault, `call_big_${index}`, { filePath: "a.ts", pad });
    }

    up = true;
    await call(tracevault, "call_after");

    expect(storedCalls()).not.toContain("call_big_1");
    const full = store.listBySession(SESSION).filter((event) => event.type === "capture.gap");
    expect(full).toHaveLength(1);
    expect((full[0]?.data as { to: string }).to >= bigObserved).toBe(true);
  });

  it("sends a file left by an exited process once, from another process", async () => {
    await call(plugin(101), "call_left");

    up = true;
    const alive = (pid: number): boolean => pid !== 101;
    await Promise.all([call(plugin(202, alive), "call_b"), call(plugin(303, alive), "call_c")]);

    expect(storedCalls().filter((id) => id === "call_left")).toHaveLength(1);
    expect(store.listBySession(SESSION).some((event) => event.type === "capture.duplicate")).toBe(false);
    expect(readdirSync(outboxDir)).toEqual([]);
  });

  it("leaves the file of a process still running to that process", async () => {
    await call(plugin(101), "call_left");

    up = true;
    await call(plugin(202, () => true), "call_b");

    expect(storedCalls()).toEqual(["call_b"]);
    expect(readdirSync(outboxDir)).toEqual(["101-1.jsonl"]);
  });

  it("falls back to today's gap when the outbox cannot be written, without reaching the agent", async () => {
    const blocked = join(directory, "not-a-folder");
    writeFileSync(blocked, "", "utf8");

    await expect(call(plugin(101, () => false, blocked), "call_1")).resolves.toBeUndefined();

    expect(gaps.load().map((gap) => gap.sessionID)).toEqual([SESSION]);
  });
});

describe("seam B: a payload's observed time is its event's time", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  const received = new Date("2026-11-17T10:00:00.000Z");

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-observed-"));
    ({ service, store } = new ServiceAssembly().open(join(directory, "events.db")));
  });

  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function storedAt(observedAt: unknown): string | undefined {
    const payload = { ...(toolAfter("call_1") as object), ...(observedAt === undefined ? {} : { observedAt }) };
    service.recordHookPayload(payload, received);
    return store.listBySession(SESSION)[0]?.timestamp;
  }

  it("stores a payload at its observed time", () => {
    expect(storedAt("2026-11-17T09:00:00.000Z")).toBe("2026-11-17T09:00:00.000Z");
  });

  it("accepts an observed time up to 5 s after it was received", () => {
    expect(storedAt("2026-11-17T10:00:04.000Z")).toBe("2026-11-17T10:00:04.000Z");
  });

  it("stores a payload observed in the future at the time received", () => {
    expect(storedAt("2026-11-17T10:00:06.000Z")).toBe(received.toISOString());
  });

  it("stores a payload with an invalid observed time at the time received", () => {
    expect(storedAt("not a time")).toBe(received.toISOString());
  });

  it("stores a payload without an observed time at the time received", () => {
    expect(storedAt(undefined)).toBe(received.toISOString());
  });

  it("keeps a prompt's own time", () => {
    service.recordHookPayload(
      { hook: "chat.message", sessionID: SESSION, messageID: "msg_1", createdAt: "2026-11-17T08:00:00.000Z", text: "hi", observedAt: "2026-11-17T09:00:00.000Z" },
      received,
    );
    expect(store.listBySession(SESSION)[0]?.timestamp).toBe("2026-11-17T08:00:00.000Z");
  });

  it("keeps a gap's own time", () => {
    service.recordHookPayload(
      { hook: "capture.gap", sessionID: SESSION, from: "2026-11-17T07:00:00.000Z", to: "2026-11-17T08:00:00.000Z", reason: "outbox full", observedAt: "2026-11-17T09:00:00.000Z" },
      received,
    );
    expect(store.listBySession(SESSION)[0]?.timestamp).toBe("2026-11-17T08:00:00.000Z");
  });
});

describe("seam A: a late event takes its place on the timeline", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;
  let server: DashboardServer;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-outbox-seam-a-"));
    ({ service, store, server } = new ServiceAssembly().open(join(directory, "events.db")));
    baseUrl = `http://127.0.0.1:${await server.listen(0)}`;
  });

  afterEach(async () => {
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("shows an event sent late at the time it was observed", async () => {
    const at = (iso: string): Date => new Date(iso);
    service.recordHookPayload({ ...(toolAfter("call_a") as object), observedAt: "2026-11-17T10:00:00.000Z" }, at("2026-11-17T10:00:00.000Z"));
    service.recordHookPayload({ ...(toolAfter("call_c") as object), observedAt: "2026-11-17T10:05:00.000Z" }, at("2026-11-17T10:05:00.000Z"));
    service.recordHookPayload({ ...(toolAfter("call_b") as object), observedAt: "2026-11-17T10:01:00.000Z" }, at("2026-11-17T10:10:00.000Z"));

    const page = await (await fetch(`${baseUrl}/sessions/${SESSION}`)).text();
    const timeline = page.slice(page.indexOf('id="timeline"'));
    const positions = ["call_a.ts", "call_b.ts", "call_c.ts"].map((name) => timeline.indexOf(name));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);
  });
});
