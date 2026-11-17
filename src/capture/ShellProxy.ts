import { connect, createServer, type Server, type Socket } from "node:net";

const LOOPBACK = "127.0.0.1";
const HEAD_END = "\r\n\r\n";
// A request head larger than this is not a proxy request; the connection is dropped, not buffered forever.
const HEAD_LIMIT = 64 * 1024;
// Meant for the proxy or for one hop, never for the host behind it.
const HOP_HEADERS = /^(proxy-[^:]*|connection|keep-alive):/i;

/** The bash call that owns a proxy: every connection on its port is that call's. */
export interface ShellProxyOwner {
  readonly sessionID: string;
  readonly callID: string;
}

/** The `/hook` payload for one connection: where it went, never a path, header or body. */
export interface NetConnectHook {
  readonly hook: "net.connect";
  readonly sessionID: string;
  readonly callID: string;
  readonly host: string;
  readonly port: number;
  readonly kind: "https" | "http";
  readonly opened: boolean;
}

interface Target {
  readonly host: string;
  readonly port: number;
  readonly kind: "https" | "http";
  /** What the upstream receives before the client's remaining bytes: nothing for a tunnel, the rewritten head for a plain request. */
  readonly head: Buffer;
}

/**
 * A forwarding proxy for one bash call, on 127.0.0.1 and a port the system
 * picks. It handles `CONNECT host:port` and absolute-URL plain HTTP, passes
 * the bytes through unchanged, never refuses, and hands over one
 * `net.connect` per connection. Written on `node:net` only: that is what the
 * 17 Nov 2026 probe proved in OpenCode's Bun plugin runtime.
 */
export class ShellProxy {
  constructor(
    private readonly owner: ShellProxyOwner,
    private readonly record: (connection: NetConnectHook) => void,
  ) {}

  /** Resolves with the port. The server does not keep the process alive, and stays open until it exits. */
  listen(): Promise<number> {
    const server: Server = createServer({ allowHalfOpen: true }, (client) => this.serve(client));
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, LOOPBACK, () => {
        server.unref();
        resolve((server.address() as { port: number }).port);
      });
    });
  }

  private serve(client: Socket): void {
    let buffered = Buffer.alloc(0);
    const read = (chunk: Buffer): void => {
      buffered = Buffer.concat([buffered, chunk]);
      const end = buffered.indexOf(HEAD_END);
      if (end < 0) {
        if (buffered.length > HEAD_LIMIT) {
          client.destroy();
        }
        return;
      }
      client.off("data", read);
      client.pause();
      const target = this.target(buffered.subarray(0, end).toString("latin1"));
      if (target === null) {
        client.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
        return;
      }
      this.forward(client, target, buffered.subarray(end + HEAD_END.length));
    };
    client.on("data", read);
    client.on("error", () => client.destroy());
  }

  private forward(client: Socket, target: Target, rest: Buffer): void {
    const upstream = connect({ host: target.host, port: target.port, allowHalfOpen: true });
    let opened = false;
    upstream.once("connect", () => {
      opened = true;
      this.note(target, true);
      if (target.kind === "https") {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      }
      upstream.write(Buffer.concat([target.head, rest]));
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on("error", () => {
      if (!opened) {
        this.note(target, false);
        client.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
        return;
      }
      client.destroy();
    });
    // A normal end travels through the pipes; an aborted client takes its upstream with it.
    client.on("close", () => upstream.destroy());
  }

  /** The destination of a request head, or null when it is not a proxy request. */
  private target(head: string): Target | null {
    const [requestLine = "", ...headers] = head.split("\r\n");
    const [method, address, version] = requestLine.split(" ");
    if (method === undefined || address === undefined || version === undefined) {
      return null;
    }
    if (method.toUpperCase() === "CONNECT") {
      const match = /^(?:\[([^\]]+)\]|([^:[\]]+)):(\d+)$/.exec(address);
      const port = Number(match?.[3]);
      const host = match?.[1] ?? match?.[2];
      return host === undefined || !this.validPort(port) ? null : { host, port, kind: "https", head: Buffer.alloc(0) };
    }
    let url: URL;
    try {
      url = new URL(address);
    } catch {
      return null;
    }
    const port = Number(url.port || 80);
    if (url.protocol !== "http:" || !this.validPort(port)) {
      return null;
    }
    // Origin form for the host, and one request per upstream: a kept-alive client could otherwise send the next request, for another host, to this one.
    const kept = headers.filter((line) => !HOP_HEADERS.test(line));
    const rewritten = [`${method} ${url.pathname}${url.search} ${version}`, ...kept, "Connection: close"].join("\r\n");
    return { host: url.hostname.replace(/^\[(.*)\]$/, "$1"), port, kind: "http", head: Buffer.from(`${rewritten}${HEAD_END}`, "latin1") };
  }

  private validPort(port: number): boolean {
    return Number.isInteger(port) && port > 0 && port < 65536;
  }

  private note(target: Target, opened: boolean): void {
    try {
      this.record({ hook: "net.connect", ...this.owner, host: target.host, port: target.port, kind: target.kind, opened });
    } catch {
      // A proxy that cannot record still forwards.
    }
  }
}
