import { createServer, type IncomingMessage, request as forward, type Server, type ServerResponse } from "node:http";
import { connect } from "node:net";
import type { Duplex } from "node:stream";
import type { NetConnectData } from "../schema/NetConnectData.js";

const LOOPBACK = "127.0.0.1";
// Meant for the proxy, never for the host behind it: the first carries the session and call.
const PROXY_HEADERS = new Set(["proxy-authorization", "proxy-connection"]);

/**
 * A forwarding proxy for the agent's shell, on 127.0.0.1. It passes every
 * byte through unchanged and never refuses a connection; for each one it
 * hands over only the host, the port, the kind and whether the upstream
 * opened, attributed to the session and call named in the proxy address.
 */
export class ShellProxy {
  private server: Server | null = null;

  constructor(private readonly record: (sessionId: string, data: NetConnectData) => void) {}

  listen(port: number): Promise<number> {
    const server = createServer((request, response) => this.relay(request, response));
    server.on("connect", (request: IncomingMessage, client: Duplex, head: Buffer) => this.tunnel(request, client, head));
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, LOOPBACK, () => {
        this.server = server;
        const address = server.address();
        resolve(typeof address === "object" && address !== null ? address.port : port);
      });
    });
  }

  close(): Promise<void> {
    const server = this.server;
    this.server = null;
    server?.closeAllConnections();
    return new Promise((resolve) => (server === null || server === undefined ? resolve() : server.close(() => resolve())));
  }

  /** `CONNECT host:port`: the client's bytes, encrypted or not, go through untouched. */
  private tunnel(request: IncomingMessage, client: Duplex, head: Buffer): void {
    const { hostname, port } = new URL(`http://${request.url ?? ""}`);
    const host = hostname.replace(/^\[(.*)\]$/, "$1");
    const target = Number(port || 443);
    const upstream = connect(target, host);
    let opened = false;
    upstream.once("connect", () => {
      opened = true;
      this.note(request, { host, port: target, kind: "https", opened });
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on("error", () => {
      if (!opened) {
        this.note(request, { host, port: target, kind: "https", opened });
        client.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        return;
      }
      client.destroy();
    });
    client.on("error", () => upstream.destroy());
  }

  /** An absolute-URL request (`GET http://host/path`): forwarded with its headers and body, minus the proxy's own headers. */
  private relay(request: IncomingMessage, response: ServerResponse): void {
    let url: URL;
    try {
      url = new URL(request.url ?? "");
    } catch {
      response.writeHead(400).end();
      return;
    }
    const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
    const port = Number(url.port || 80);
    const headers: string[] = [];
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      if (!PROXY_HEADERS.has((request.rawHeaders[index] ?? "").toLowerCase())) {
        headers.push(request.rawHeaders[index] ?? "", request.rawHeaders[index + 1] ?? "");
      }
    }
    let opened = false;
    const outgoing = forward({ host, port, method: request.method, path: `${url.pathname}${url.search}`, headers, agent: false }, (answer) => {
      response.writeHead(answer.statusCode ?? 502, answer.statusMessage, answer.rawHeaders);
      answer.pipe(response);
    });
    outgoing.on("socket", (socket) =>
      socket.once("connect", () => {
        opened = true;
        this.note(request, { host, port, kind: "http", opened });
      }),
    );
    outgoing.on("error", () => {
      if (!opened) {
        this.note(request, { host, port, kind: "http", opened });
      }
      if (!response.headersSent) {
        response.writeHead(502).end();
        return;
      }
      response.destroy();
    });
    request.pipe(outgoing);
  }

  /** The proxy address's user name is the session, its password the call. Any value is accepted: this is attribution, not authentication. */
  private note(request: IncomingMessage, connection: Omit<NetConnectData, "call_id">): void {
    const [scheme, encoded] = (request.headers["proxy-authorization"] ?? "").split(" ");
    const credentials = scheme?.toLowerCase() === "basic" && encoded !== undefined ? Buffer.from(encoded, "base64").toString("utf8") : "";
    const split = credentials.indexOf(":");
    // Clients decode the proxy address's user name and password before they encode the header.
    const sessionId = split < 0 ? credentials : credentials.slice(0, split);
    const callId = split < 0 ? "" : credentials.slice(split + 1);
    if (sessionId === "") {
      // shortcut: a connection that names no session (git's) is forwarded but not recorded; where to store it is Kevin's decision (ticket 86).
      return;
    }
    try {
      this.record(sessionId, { ...connection, call_id: callId === "" ? null : callId });
    } catch {
      // A proxy that cannot record still forwards.
    }
  }
}
