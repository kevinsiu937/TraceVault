import type { IncomingMessage } from "node:http";

const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/i;

/**
 * Decides whether a request was meant for this service. Listening on loopback
 * does not stop a web page: a browser will post to 127.0.0.1 for any site, and a
 * site whose name is re-pointed at 127.0.0.1 can read the answers.
 */
export class LocalRequest {
  allows(request: IncomingMessage): boolean {
    const host = request.headers.host ?? "";
    if (!LOCAL_HOST.test(host)) {
      return false;
    }
    // A browser names the calling page on every cross-site POST; the plugin sends no Origin.
    const origin = request.headers.origin;
    return origin === undefined || origin.toLowerCase() === `http://${host.toLowerCase()}`;
  }
}
