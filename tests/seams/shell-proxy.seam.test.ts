import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { type AddressInfo, createConnection, createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "../../src/cli/index.js";
import { ServiceAssembly } from "../../src/cli/ServiceAssembly.js";
import type { DashboardServer } from "../../src/dashboard/DashboardServer.js";
import { PendingGapStore } from "../../src/plugin/PendingGapStore.js";
import { ShellProxies } from "../../src/plugin/ShellProxies.js";
import { TraceVaultPlugin, type TraceVaultHooks } from "../../src/plugin/TraceVaultPlugin.js";
import type { Event } from "../../src/schema/Event.js";
import type { InvestigationService } from "../../src/service/InvestigationService.js";
import type { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

// Recorded 17 Nov 2026 (shell-proxy-plugin-probe.sh, OpenCode 1.18.32, Bun 1.3.14): what one bash call's port received.
const probe = JSON.parse(readFileSync(join(import.meta.dirname, "../fixtures/shell-proxy-plugin-probe.json"), "utf8")) as {
  records: readonly { kind: string; method?: string; target?: string }[];
};
const bashPayload = JSON.parse(readFileSync(join(import.meta.dirname, "../fixtures/tool-execute-after-bash.json"), "utf8")) as { input: { sessionID: string; callID: string } };

const SESSION = "ses_proxy";
const CALL = "call_proxy_1";
const PROXY_VARIABLES = ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"];

/** Sends raw bytes to the proxy and resolves with everything it answers until the first `until` matches. */
function exchange(port: number, request: string, until: RegExp): Promise<{ text: string; socket: Socket }> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(port, "127.0.0.1", () => socket.write(request));
    let text = "";
    socket.on("data", (chunk) => {
      text += chunk.toString("latin1");
      if (until.test(text)) {
        resolve({ text, socket });
      }
    });
    socket.on("error", reject);
  });
}

function listening<T extends Server | HttpServer>(server: T): Promise<number> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
}

function closed(server: Server | HttpServer): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("seam B: each bash call's shell goes through its own proxy, and every connection is stored under that call", () => {
  let directory: string;
  let db: string;
  let service: InvestigationService;
  let store: SqliteEventStore;
  let server: DashboardServer;
  let echo: Server;
  let echoPort: number;
  let sockets: Socket[];
  let delivered: () => void;
  let serviceDown: boolean;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-proxy-"));
    db = join(directory, "events.db");
    ({ service, store, server } = new ServiceAssembly().open(db));
    sockets = [];
    delivered = () => undefined;
    serviceDown = false;
    // The throwaway upstream: a TCP server on 127.0.0.1 that sends back every byte it receives.
    echo = createServer((socket) => socket.pipe(socket));
    echoPort = await listening(echo);
  });

  afterEach(async () => {
    sockets.forEach((socket) => socket.destroy());
    await closed(echo);
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  /** A plugin posting to the real service, as the installed one posts to /hook; `environment` stands in for OpenCode's own. */
  function plugin(environment: Record<string, string> = {}): TraceVaultHooks {
    const forwarder = {
      forward: async (payload: unknown): Promise<void> => {
        if (serviceDown) {
          throw new Error("connection refused");
        }
        expect(service.recordHookPayload(payload, new Date())).toBe("stored");
        delivered();
      },
    };
    return new TraceVaultPlugin(forwarder, new PendingGapStore(join(directory, "gaps.json")), undefined, null, undefined, undefined, new ShellProxies(environment)).hooks();
  }

  /** The env one bash call gets from the plugin. */
  async function shellEnv(hooks: TraceVaultHooks, sessionID = SESSION, callID = CALL, env: Record<string, string> = {}): Promise<Record<string, string>> {
    const output = { env };
    await hooks["shell.env"]({ cwd: directory, sessionID, callID }, output);
    return output.env;
  }

  function proxyPort(env: Record<string, string>): number {
    return Number(new URL(env["HTTPS_PROXY"] ?? "").port);
  }

  function connections(sessionId = SESSION): Event[] {
    return store.listBySession(sessionId).filter((event) => event.type === "net.connect");
  }

  /** Resolves once `count` connections are stored; delivery runs beside the forwarding, never in front of it. */
  async function stored(count: number, sessionId = SESSION): Promise<Event[]> {
    while (connections(sessionId).length < count) {
      await new Promise<void>((resolve) => (delivered = resolve));
    }
    return connections(sessionId);
  }

  async function tunnel(port: number, target = echoPort): Promise<{ text: string; socket: Socket }> {
    // git's shape (17 Nov probe): a CONNECT with no proxy credentials.
    const result = await exchange(port, `CONNECT 127.0.0.1:${target} HTTP/1.1\r\nHost: 127.0.0.1:${target}\r\nUser-Agent: git/2.39.5\r\n\r\n`, /\r\n\r\n/);
    sockets.push(result.socket);
    return result;
  }

  function echoed(socket: Socket, bytes: Buffer): Promise<Buffer> {
    return new Promise((resolve) => {
      socket.once("data", (chunk: Buffer) => resolve(chunk));
      socket.write(bytes);
    });
  }

  it("points the call's proxy variables at a port of its own, and keeps local traffic direct", async () => {
    const env = await shellEnv(plugin());

    const url = env["HTTPS_PROXY"] ?? "";
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(PROXY_VARIABLES.map((name) => env[name])).toEqual([url, url, url, url]);
    expect(env["NO_PROXY"]).toBe("localhost,127.0.0.1,::1");
    expect(env["no_proxy"]).toBe("localhost,127.0.0.1,::1");
  });

  it("adds the local hosts to a NO_PROXY the shell already has", async () => {
    const env = await shellEnv(plugin(), SESSION, CALL, { NO_PROXY: "internal.example" });

    expect(env["NO_PROXY"]).toBe("internal.example,localhost,127.0.0.1,::1");
  });

  it("tunnels a CONNECT without credentials byte for byte and stores the host, port, kind and its call", async () => {
    const port = proxyPort(await shellEnv(plugin()));
    expect(probe.records.some((record) => record.method === "CONNECT")).toBe(true);

    const { text, socket } = await tunnel(port);
    expect(text).toMatch(/^HTTP\/1\.1 200 /);
    const bytes = Buffer.from([0x16, 0x03, 0x01, 0x00, 0xff, 0x00, 0x0d, 0x0a]);
    expect((await echoed(socket, bytes)).equals(bytes)).toBe(true);

    const [event] = await stored(1);
    expect(event?.capture_path).toBe("proxy");
    expect(event?.type === "net.connect" ? event.data : null).toEqual({ host: "127.0.0.1", port: echoPort, kind: "https", call_id: CALL, opened: true });
  });

  it("forwards a plain request and its answer unchanged, and stores no path, header or body", async () => {
    const port = proxyPort(await shellEnv(plugin()));
    const upstream = createHttpServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => (body += String(chunk)));
      request.on("end", () => response.end(`got ${request.method} ${request.url} ${request.headers["x-secret"]} ${request.headers["proxy-connection"]} ${body}`));
    });
    const target = await listening(upstream);
    try {
      const request = [
        `POST http://127.0.0.1:${target}/upload/secret-path?token=t0p HTTP/1.1`,
        `Host: 127.0.0.1:${target}`,
        "Proxy-Connection: keep-alive",
        "X-Secret: header-value",
        "Content-Length: 11",
        "",
        "body-secret",
      ].join("\r\n");
      const { text, socket } = await exchange(port, request, /got .* body-secret$/);
      sockets.push(socket);

      expect(text).toMatch(/^HTTP\/1\.1 200 /);
      expect(text).toMatch(/got POST \/upload\/secret-path\?token=t0p header-value undefined body-secret$/);
      const [event] = await stored(1);
      expect(event?.type === "net.connect" ? event.data : null).toEqual({ host: "127.0.0.1", port: target, kind: "http", call_id: CALL, opened: true });
      const all = JSON.stringify(store.listAllOrdered().map((row) => row.stored));
      for (const secret of ["secret-path", "t0p", "header-value", "body-secret", "X-Secret"]) {
        expect(all).not.toContain(secret);
      }
    } finally {
      upstream.closeAllConnections();
      await closed(upstream);
    }
  });

  it("closes a plain request's upstream after one answer, so a second request cannot reach the first host", async () => {
    const port = proxyPort(await shellEnv(plugin()));
    const seen: string[] = [];
    const upstream = createHttpServer((request, response) => {
      seen.push(request.url ?? "");
      response.end("one");
    });
    const target = await listening(upstream);
    try {
      const first = `GET http://127.0.0.1:${target}/first HTTP/1.1\r\nHost: 127.0.0.1:${target}\r\nConnection: keep-alive\r\n\r\n`;
      const second = `GET http://other.invalid/second HTTP/1.1\r\nHost: other.invalid\r\n\r\n`;
      const closedText = await new Promise<string>((resolve, reject) => {
        const socket = createConnection(port, "127.0.0.1", () => socket.write(first + second));
        let text = "";
        socket.on("data", (chunk) => (text += chunk.toString("latin1")));
        socket.on("close", () => resolve(text));
        socket.on("error", reject);
      });

      expect(closedText).toMatch(/^HTTP\/1\.1 200 /);
      expect(seen).toEqual(["/first"]);
    } finally {
      await closed(upstream);
    }
  });

  it("stores a connection whose upstream refuses as not opened, and answers 502", async () => {
    const port = proxyPort(await shellEnv(plugin()));
    const refusing = createServer();
    const target = await listening(refusing);
    await closed(refusing);

    const { text } = await tunnel(port, target);

    expect(text).toMatch(/^HTTP\/1\.1 502 /);
    expect((await stored(1)).map((event) => (event.type === "net.connect" ? event.data.opened : null))).toEqual([false]);
  });

  it("gives two calls two ports, and attributes each connection to its own call", async () => {
    const hooks = plugin();
    const first = proxyPort(await shellEnv(hooks, SESSION, "call_a"));
    const second = proxyPort(await shellEnv(hooks, "ses_other", "call_b"));
    expect(first).not.toBe(second);

    await tunnel(second);
    await tunnel(first);

    expect((await stored(1)).map((event) => (event.type === "net.connect" ? event.data.call_id : null))).toEqual(["call_a"]);
    expect((await stored(1, "ses_other")).map((event) => (event.type === "net.connect" ? event.data.call_id : null))).toEqual(["call_b"]);
  });

  it("leaves a proxy the shell already has alone, and records that the shell was not watched", async () => {
    const env = await shellEnv(plugin(), SESSION, CALL, { HTTPS_PROXY: "http://corp.invalid:8080" });

    expect(env).toEqual({ HTTPS_PROXY: "http://corp.invalid:8080" });
    const [gap] = store.listBySession(SESSION).filter((event) => event.type === "capture.gap");
    expect(gap?.type === "capture.gap" ? gap.data.reason : null).toBe(`shell not watched for call ${CALL}: HTTPS_PROXY was already set`);
  });

  it("leaves the shell alone when OpenCode itself runs behind a proxy", async () => {
    const env = await shellEnv(plugin({ http_proxy: "http://corp.invalid:3128" }));

    expect(env).toEqual({});
    const [gap] = store.listBySession(SESSION).filter((event) => event.type === "capture.gap");
    expect(gap?.type === "capture.gap" ? gap.data.reason : null).toBe(`shell not watched for call ${CALL}: http_proxy was already set`);
  });

  it("still points the shell at its proxy and forwards its connections while the service is down", async () => {
    serviceDown = true;
    const port = proxyPort(await shellEnv(plugin()));

    const { text, socket } = await tunnel(port);

    expect(text).toMatch(/^HTTP\/1\.1 200 /);
    expect((await echoed(socket, Buffer.from("ping"))).toString()).toBe("ping");
  });

  it("stores only where a posted connection went, and rejects one that names no real port", () => {
    const posted = { hook: "net.connect", sessionID: SESSION, callID: CALL, host: "example.test", port: 443, kind: "https", opened: true };

    expect(service.recordHookPayload({ ...posted, path: "/upload/secret-path" }, new Date())).toBe("stored");
    expect(service.recordHookPayload({ ...posted, port: 0 }, new Date())).toBe("rejected");
    expect(connections().map((event) => event.data)).toEqual([{ host: "example.test", port: 443, kind: "https", call_id: CALL, opened: true }]);
  });

  it("keeps the record verifiable with connections in it", async () => {
    await tunnel(proxyPort(await shellEnv(plugin())));
    await stored(1);
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      await expect(main(["verify", "--db", db])).resolves.toBe(0);
    } finally {
      output.mockRestore();
    }
  });

  it("nests the connection under its bash call on the session page, and opens it in the detail pane (seam A)", async () => {
    const session = bashPayload.input.sessionID;
    // The connection happens while the call runs; the call itself is recorded when it ends, later.
    await tunnel(proxyPort(await shellEnv(plugin(), session, bashPayload.input.callID)));
    const [connection] = await stored(1, session);
    expect(service.recordHookPayload(bashPayload, new Date(Date.now() + 5000))).toBe("stored");
    const [bash] = store.listBySession(session).filter((event) => event.type === "hook.script");
    const base = `http://127.0.0.1:${await server.listen(0)}`;

    const page = await (await fetch(`${base}/sessions/${session}`)).text();
    const rows = [...page.matchAll(/<li class="event[^"]*"[^>]*data-event-id="([^"]+)"[^>]*>/g)];
    const index = rows.findIndex((row) => row[1] === bash?.id);
    expect(rows[index + 1]?.[1]).toBe(connection?.id);
    expect(rows[index + 1]?.[0]).toContain(`data-parent="${bash?.id}"`);
    expect(page).toContain(`connected to 127.0.0.1:${echoPort}`);

    const detail = await (await fetch(`${base}/sessions/${session}?event=${connection?.id}`)).text();
    expect(detail).toMatch(new RegExp(`<dt>Target</dt><dd class="mono detail-target">127\\.0\\.0\\.1:${echoPort}</dd>`));
  });

  it("says on the session page that the shell was not watched (seam A)", async () => {
    await shellEnv(plugin(), SESSION, CALL, { HTTPS_PROXY: "http://corp.invalid:8080" });
    const base = `http://127.0.0.1:${await server.listen(0)}`;

    const page = await (await fetch(`${base}/sessions/${SESSION}`)).text();

    expect(page).toContain(`shell not watched for call ${CALL}: HTTPS_PROXY was already set`);
  });
});

describe("tracevault run: no proxy beside the service", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-run-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("starts the service without a proxy port or a proxy line", async () => {
    const viteNode = join(import.meta.dirname, "../../node_modules/vite-node/vite-node.mjs");
    const runner = join(import.meta.dirname, "run.writer.ts");
    const child = spawn(process.execPath, [viteNode, runner, "run", "--port", "0", "--db", join(directory, "events.db")], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TRACEVAULT_OPENCODE_DB: join(directory, "no-opencode.db") },
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout.on("data", () => output.includes("events db:") && resolve());
        child.once("exit", (code) => reject(new Error(`run exited ${code}: ${output}`)));
      });

      expect(output).toContain("tracevault listening on http://127.0.0.1:");
      expect(output).not.toContain("proxy");
    } finally {
      child.kill();
    }
  }, 30_000);
});
