import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { type AddressInfo, createConnection, createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ShellProxy } from "../../src/capture/ShellProxy.js";
import { main } from "../../src/cli/index.js";
import { ServiceAssembly } from "../../src/cli/ServiceAssembly.js";
import type { DashboardServer } from "../../src/dashboard/DashboardServer.js";
import type { Event } from "../../src/schema/Event.js";
import type { InvestigationService } from "../../src/service/InvestigationService.js";
import type { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

// Recorded 16 Nov 2026 (shell-proxy-probe.sh, OpenCode 1.18.32): what curl, pip, python3 and git sent the proxy.
const probe = JSON.parse(readFileSync(join(import.meta.dirname, "../fixtures/shell-proxy-probe.json"), "utf8")) as {
  proxyRequests: readonly { kind: "http" | "https"; auth: string | null; agent: string | null }[];
};
const bashPayload = JSON.parse(readFileSync(join(import.meta.dirname, "../fixtures/tool-execute-after-bash.json"), "utf8")) as { input: { sessionID: string; callID: string } };

const SESSION = "ses_proxy";
const CALL = "call_proxy_1";

function basic(auth: string): string {
  return `Basic ${Buffer.from(auth).toString("base64")}`;
}

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

describe("seam B: the shell proxy forwards a connection unchanged and records where it went", () => {
  let directory: string;
  let db: string;
  let service: InvestigationService;
  let store: SqliteEventStore;
  let server: DashboardServer;
  let proxy: ShellProxy;
  let proxyPort: number;
  let echo: Server;
  let echoPort: number;
  let sockets: Socket[];

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-proxy-"));
    db = join(directory, "events.db");
    ({ service, store, server, proxy } = new ServiceAssembly().open(db));
    proxyPort = await proxy.listen(0);
    sockets = [];
    // The throwaway upstream: a TCP server on 127.0.0.1 that sends back every byte it receives.
    echo = createServer((socket) => socket.pipe(socket));
    echoPort = await listening(echo);
  });

  afterEach(async () => {
    sockets.forEach((socket) => socket.destroy());
    await closed(echo);
    await proxy.close();
    await server.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function connections(sessionId: string): Event[] {
    return store.listBySession(sessionId).filter((event) => event.type === "net.connect");
  }

  async function tunnel(auth: string | null, port = echoPort): Promise<{ text: string; socket: Socket }> {
    const header = auth === null ? "" : `Proxy-Authorization: ${basic(auth)}\r\n`;
    const result = await exchange(proxyPort, `CONNECT 127.0.0.1:${port} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${header}User-Agent: curl/8.7.1\r\n\r\n`, /\r\n\r\n/);
    sockets.push(result.socket);
    return result;
  }

  it("tunnels a CONNECT byte for byte and records the host, port, kind and its session and call", async () => {
    const { text, socket } = await tunnel(`${SESSION}:${CALL}`);
    expect(text).toMatch(/^HTTP\/1\.1 200 /);

    const bytes = Buffer.from([0x16, 0x03, 0x01, 0x00, 0xff, 0x00, 0x0d, 0x0a]);
    const echoed = await new Promise<Buffer>((resolve) => {
      socket.once("data", (chunk: Buffer) => resolve(chunk));
      socket.write(bytes);
    });
    expect(echoed.equals(bytes)).toBe(true);

    const [event] = connections(SESSION);
    expect(event?.capture_path).toBe("proxy");
    expect(event?.type === "net.connect" ? event.data : null).toEqual({ host: "127.0.0.1", port: echoPort, kind: "https", call_id: CALL, opened: true });
  });

  it("forwards a plain request and its answer unchanged, and stores no path, header or body", async () => {
    const upstream = createHttpServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => (body += String(chunk)));
      request.on("end", () => response.end(`got ${request.method} ${request.url} ${request.headers["x-secret"]} ${body}`));
    });
    const port = await listening(upstream);
    try {
      const request = [
        `POST http://127.0.0.1:${port}/upload/secret-path?token=t0p HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        `Proxy-Authorization: ${basic(`${SESSION}:${CALL}`)}`,
        "X-Secret: header-value",
        "Content-Length: 11",
        "Connection: close",
        "",
        "body-secret",
      ].join("\r\n");
      const { text, socket } = await exchange(proxyPort, request, /got .* body-secret$/);
      sockets.push(socket);

      expect(text).toMatch(/^HTTP\/1\.1 200 /);
      expect(text).toMatch(/got POST \/upload\/secret-path\?token=t0p header-value body-secret$/);
      const [event] = connections(SESSION);
      expect(event?.type === "net.connect" ? event.data : null).toEqual({ host: "127.0.0.1", port, kind: "http", call_id: CALL, opened: true });
      const stored = JSON.stringify(store.listAllOrdered().map((row) => row.stored));
      for (const secret of ["secret-path", "t0p", "header-value", "body-secret", "X-Secret", "curl/8.7.1"]) {
        expect(stored).not.toContain(secret);
      }
    } finally {
      await closed(upstream);
    }
  });

  it("attributes each request built from the probe's recording to the session and call it named", async () => {
    const attributed = probe.proxyRequests.filter((request) => request.auth !== null);
    expect(attributed.length).toBeGreaterThan(0);
    for (const request of attributed) {
      await tunnel(request.auth);
    }

    const expected = new Map<string, string[]>();
    for (const request of attributed) {
      const [sessionId = "", callId = ""] = (request.auth ?? "").split(":");
      expected.set(sessionId, [...(expected.get(sessionId) ?? []), callId]);
    }
    expect(expected.size).toBe(2);
    for (const [sessionId, calls] of expected) {
      expect(connections(sessionId).map((event) => (event.type === "net.connect" ? event.data.call_id : null))).toEqual(calls);
    }
  });

  it("still forwards a connection that names no session, as git's does", async () => {
    const { text, socket } = await tunnel(null);
    expect(text).toMatch(/^HTTP\/1\.1 200 /);
    const echoed = await new Promise<string>((resolve) => {
      socket.once("data", (chunk: Buffer) => resolve(chunk.toString()));
      socket.write("ping");
    });

    expect(echoed).toBe("ping");
  });

  it("records a connection whose upstream refuses as not opened, and answers 502", async () => {
    const refusing = createServer();
    const port = await listening(refusing);
    await closed(refusing);

    const { text } = await tunnel(`${SESSION}:${CALL}`, port);

    expect(text).toMatch(/^HTTP\/1\.1 502 /);
    expect(connections(SESSION).map((event) => (event.type === "net.connect" ? event.data.opened : null))).toEqual([false]);
  });

  it("keeps the record verifiable with connections in it", async () => {
    await tunnel(`${SESSION}:${CALL}`);
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
    await tunnel(`${session}:${bashPayload.input.callID}`);
    expect(service.recordHookPayload(bashPayload, new Date(Date.now() + 5000))).toBe("stored");
    const [bash] = store.listBySession(session).filter((event) => event.type === "hook.script");
    const [connection] = connections(session);
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
});

describe("tracevault run: the shell proxy beside the service", () => {
  let directory: string;
  let blocker: Server;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-proxy-run-"));
    blocker = createServer();
  });

  afterEach(async () => {
    await closed(blocker);
    rmSync(directory, { recursive: true, force: true });
  });

  it("says the proxy port is in use, and the service still starts", async () => {
    const taken = await listening(blocker);
    const viteNode = join(import.meta.dirname, "../../node_modules/vite-node/vite-node.mjs");
    const runner = join(import.meta.dirname, "run.writer.ts");
    const child = spawn(process.execPath, [viteNode, runner, "run", "--port", String(taken - 1), "--db", join(directory, "events.db")], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TRACEVAULT_OPENCODE_DB: join(directory, "no-opencode.db") },
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout.on("data", () => output.includes("tracevault listening on") && resolve());
        child.once("exit", (code) => reject(new Error(`run exited ${code}: ${output}`)));
      });

      expect(output).toContain(`shell proxy not started: port ${taken} is already in use`);
      expect(output).toContain(`tracevault listening on http://127.0.0.1:${taken - 1}`);
    } finally {
      child.kill();
    }
  }, 30_000);
});
