import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

import type { InvestigationServicePort } from "../service/InvestigationServicePort.js";
import type { ActivityView } from "./ActivityView.js";
import { ConfigurationView } from "./ConfigurationView.js";
import { ReportView } from "./ReportView.js";
import { EventStream } from "./EventStream.js";
import { FilterParams } from "./FilterParams.js";
import { HookBodyReader } from "./HookBodyReader.js";
import { LocalRequest } from "./LocalRequest.js";
import type { SessionListView } from "./SessionListView.js";
import type { SessionPageView } from "./SessionPageView.js";
import { SessionParams } from "./SessionParams.js";
import type { SessionRenderContext } from "./SessionRenderContext.js";
import type { TimelineView } from "./TimelineView.js";

const LOOPBACK = "127.0.0.1";
const SESSION_PATH = /^\/sessions\/([^/]+)$/;
const SESSION_EVENTS_PATH = /^\/sessions\/([^/]+)\/events$/;
const SESSION_CONFIG_PATH = /^\/sessions\/([^/]+)\/config$/;
const SESSION_REPORT_PATH = /^\/sessions\/([^/]+)\/report$/;

export class DashboardServer {
  private server: Server | null = null;
  private readonly eventStream: EventStream;
  private readonly bodyReader = new HookBodyReader();
  private readonly localRequest = new LocalRequest();
  private readonly filterParams = new FilterParams();

  constructor(
    private readonly service: InvestigationServicePort,
    private readonly view: SessionListView,
    timelineView: TimelineView,
    private readonly activityView: ActivityView,
    private readonly sessionPageView: SessionPageView,
    private readonly configurationView: ConfigurationView = new ConfigurationView(),
    private readonly reportView: ReportView = new ReportView(),
    private readonly printError: (line: string) => void = (line) => process.stderr.write(line),
  ) {
    this.eventStream = new EventStream(service, timelineView);
  }

  listen(port: number): Promise<number> {
    const server = createServer((request, response) => {
      void this.handle(request, response);
    });
    this.server = server;

    return new Promise((resolve, reject) => {
      const onError = (error: Error): void => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = (): void => {
        server.off("error", onError);
        const address = server.address();
        if (address === null || typeof address === "string") {
          reject(new Error("server has no TCP address"));
          return;
        }
        resolve(address.port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, LOOPBACK);
    });
  }

  close(): Promise<void> {
    const server = this.server;
    if (server === null) {
      return Promise.resolve();
    }
    this.server = null;
    return new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (!this.localRequest.allows(request)) {
        this.send(response, 403, "forbidden", "text/plain; charset=utf-8");
        return;
      }
      const url = new URL(request.url ?? "/", `http://${LOOPBACK}`);
      const path = url.pathname;
      const rules = url.searchParams.get("rules") === "then" ? "then" : "now";
      const filter = this.filterParams.parse(url);
      const state = SessionParams.parse(url);

      if (path === "/") {
        if (this.refuseNonGet(request, response)) {
          return;
        }
        this.send(response, 200, this.view.render(this.service.listSessions()), "text/html; charset=utf-8");
        return;
      }

      if (path === "/activity") {
        if (this.refuseNonGet(request, response)) {
          return;
        }
        this.send(
          response,
          200,
          this.activityView.render(this.service.listActivity(filter), filter),
          "text/html; charset=utf-8",
        );
        return;
      }

      if (path === "/hook") {
        if (request.method !== "POST") {
          this.send(response, 405, "method not allowed", "text/plain; charset=utf-8");
          return;
        }
        await this.ingest(request, response);
        return;
      }

      const eventsMatch = SESSION_EVENTS_PATH.exec(path);
      if (eventsMatch !== null) {
        if (this.refuseNonGet(request, response)) {
          return;
        }
        this.eventStream.open(decodeURIComponent(eventsMatch[1] ?? ""), filter, request, response);
        return;
      }

      const configMatch = SESSION_CONFIG_PATH.exec(path);
      if (configMatch !== null) {
        if (this.refuseNonGet(request, response)) {
          return;
        }
        const sessionId = decodeURIComponent(configMatch[1] ?? "");
        const view = this.service.getSession(sessionId);
        if (view === null) {
          this.send(response, 404, "session not found", "text/plain; charset=utf-8");
          return;
        }
        const page = this.configurationView.render(sessionId, view.summary.title, view.configuration, view.configFindings);
        this.send(response, 200, page, "text/html; charset=utf-8");
        return;
      }

      const reportMatch = SESSION_REPORT_PATH.exec(path);
      if (reportMatch !== null) {
        if (this.refuseNonGet(request, response)) {
          return;
        }
        const sessionId = decodeURIComponent(reportMatch[1] ?? "");
        if (!this.service.hasSession(sessionId)) {
          this.send(response, 404, "session not found", "text/plain; charset=utf-8");
          return;
        }
        // The id goes into a header, so only safe characters reach the file name.
        const file = `tracevault-report-${sessionId.replace(/[^A-Za-z0-9_-]/g, "_")}.html`;
        this.send(response, 200, this.reportView.render(this.service, sessionId, rules), "text/html; charset=utf-8", { "content-disposition": `attachment; filename="${file}"` });
        return;
      }

      const sessionMatch = SESSION_PATH.exec(path);
      if (sessionMatch !== null) {
        if (this.refuseNonGet(request, response)) {
          return;
        }
        const sessionId = decodeURIComponent(sessionMatch[1] ?? "");
        const view = this.service.getSession(sessionId, rules, filter);
        if (view === null) {
          this.send(response, 404, "session not found", "text/plain; charset=utf-8");
          return;
        }
        const context: SessionRenderContext = {
          sessionId,
          title: view.summary.title,
          summary: view.summary,
          entries: view.entries,
          allEntries: view.allEntries,
          findings: view.findings,
          configFindingCount: view.configFindings.length,
          rules: { viewing: rules, versions: view.ruleVersions },
          filter,
          state,
          children: view.children,
          previousSessionId: view.previousSessionId,
          nextSessionId: view.nextSessionId,
        };
        this.send(response, 200, this.sessionPageView.render(context), "text/html; charset=utf-8");
        return;
      }

      this.send(response, 404, "not found", "text/plain; charset=utf-8");
    } catch (error) {
      // The path only: a hook body holds the user's commands and file contents.
      const path = (request.url ?? "/").split("?")[0];
      this.printError(`tracevault: ${request.method ?? "?"} ${path} failed: ${error instanceof Error ? error.message : String(error)}\n`);
      if (response.headersSent) {
        response.destroy();
        return;
      }
      this.send(response, 500, "internal error", "text/plain; charset=utf-8");
    }
  }

  private async ingest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await this.bodyReader.read(request);
    if (body === null) {
      this.send(response, 413, "payload too large", "text/plain; charset=utf-8");
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      this.send(response, 400, "invalid json", "text/plain; charset=utf-8");
      return;
    }

    const result = this.service.recordHookPayload(payload, new Date());
    if (result === "rejected") {
      this.send(response, 400, "payload rejected", "text/plain; charset=utf-8");
      return;
    }

    this.send(response, 202, JSON.stringify({ result }), "application/json; charset=utf-8");
  }

  private refuseNonGet(request: IncomingMessage, response: ServerResponse): boolean {
    if (request.method === "GET") {
      return false;
    }
    this.send(response, 405, "method not allowed", "text/plain; charset=utf-8");
    return true;
  }

  private send(response: ServerResponse, status: number, body: string, contentType: string, headers: Record<string, string> = {}): void {
    response.writeHead(status, {
      ...headers,
      "content-type": contentType,
      "content-length": Buffer.byteLength(body),
      "cache-control": "no-store",
    });
    response.end(body);
  }
}
