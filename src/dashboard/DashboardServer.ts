import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

import type { InvestigationServicePort } from "../service/InvestigationServicePort.js";
import type { ActivityView } from "./ActivityView.js";
import { ConfigurationView } from "./ConfigurationView.js";
import { ReportView } from "./ReportView.js";
import { DetailPaneView } from "./DetailPaneView.js";
import { EventStream } from "./EventStream.js";
import { FilterParams } from "./FilterParams.js";
import { HookBodyReader } from "./HookBodyReader.js";
import { SessionHeaderView } from "./SessionHeaderView.js";
import type { SessionListView } from "./SessionListView.js";
import { SessionPageView } from "./SessionPageView.js";
import { SessionParams } from "./SessionParams.js";
import { FileRailView } from "./FileRailView.js";
import { GraphView } from "./GraphView.js";
import { ReplayBarView } from "./ReplayBarView.js";
import { WaterfallView } from "./WaterfallView.js";
import { SubagentPortalView } from "./SubagentPortalView.js";
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
  private readonly sessionPageView: SessionPageView;

  constructor(
    private readonly service: InvestigationServicePort,
    private readonly view: SessionListView,
    timelineView: TimelineView,
    private readonly activityView: ActivityView,
    private readonly filterParams: FilterParams = new FilterParams(),
    sessionPageView?: SessionPageView,
    private readonly configurationView: ConfigurationView = new ConfigurationView(),
    private readonly reportView: ReportView = new ReportView(),
  ) {
    this.eventStream = new EventStream(service, timelineView);
    this.sessionPageView = sessionPageView ?? new SessionPageView(
      new SessionHeaderView(),
      [new FileRailView(), timelineView, new WaterfallView(), new GraphView(), new SubagentPortalView(), new ReplayBarView()],
      new DetailPaneView(),
    );
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
        if (!this.service.hasSession(sessionId)) {
          this.send(response, 404, "session not found", "text/plain; charset=utf-8");
          return;
        }
        const title = this.service.listSessions().find((session) => session.sessionId === sessionId)?.title ?? "";
        const page = this.configurationView.render(
          sessionId,
          title,
          this.service.getConfiguration(sessionId),
          this.service.getConfigFindings(sessionId),
        );
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
        if (!this.service.hasSession(sessionId)) {
          this.send(response, 404, "session not found", "text/plain; charset=utf-8");
          return;
        }
        const allEntries = this.service.getTimeline(sessionId, undefined, rules);
        const entries = filter.active ? this.service.getTimeline(sessionId, filter, rules) : allEntries;
        const sessions = this.service.listSessions();
        const index = sessions.findIndex((session) => session.sessionId === sessionId);
        const summary = sessions[index] ?? {
          sessionId,
          parentSessionId: null,
          title: "",
          agentName: "",
          startedAt: allEntries[0]?.time ?? "",
          endedAt: null,
          eventCount: allEntries.length,
          gapCount: 0,
          lastActivityAt: allEntries[0]?.time ?? "",
          filesTouched: 0,
          errorCount: 0,
          deniedCount: 0,
          lastOutcome: null,
          density: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          durationMs: null,
        };
        const context: SessionRenderContext = {
          sessionId,
          title: summary.title,
          summary,
          entries,
          allEntries,
          findings: this.service.getFindings(sessionId, rules),
          configFindingCount: this.service.getConfigFindings(sessionId, rules).length,
          rules: { viewing: rules, versions: this.service.getRuleVersions(sessionId) },
          filter,
          state,
          sessions,
          previousSessionId: index >= 0 ? sessions[index + 1]?.sessionId ?? null : null,
          nextSessionId: index > 0 ? sessions[index - 1]?.sessionId ?? null : null,
        };
        this.send(response, 200, this.sessionPageView.render(context), "text/html; charset=utf-8");
        return;
      }

      this.send(response, 404, "not found", "text/plain; charset=utf-8");
    } catch {
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
