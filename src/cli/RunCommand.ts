import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ActivityView } from "../dashboard/ActivityView.js";
import { DashboardServer } from "../dashboard/DashboardServer.js";
import { DetailPaneView } from "../dashboard/DetailPaneView.js";
import { FileRailView } from "../dashboard/FileRailView.js";
import { FindingsPanelView } from "../dashboard/FindingsPanelView.js";
import { SkippedCallsView } from "../dashboard/SkippedCallsView.js";
import { GraphView } from "../dashboard/GraphView.js";
import { ReplayBarView } from "../dashboard/ReplayBarView.js";
import { SessionHeaderView } from "../dashboard/SessionHeaderView.js";
import { SessionListView } from "../dashboard/SessionListView.js";
import { SessionPageView } from "../dashboard/SessionPageView.js";
import { SubagentPortalView } from "../dashboard/SubagentPortalView.js";
import { TimelineView } from "../dashboard/TimelineView.js";
import { WaterfallView } from "../dashboard/WaterfallView.js";
import { HistoryImportCommand } from "./HistoryImportCommand.js";
import { ServiceAssembly } from "./ServiceAssembly.js";

/** Assembles the local service (capture, scanners, dashboard) and starts it on 127.0.0.1. */
export class RunCommand {
  async run(port: number, dbPath: string): Promise<number> {
    let assembly: ServiceAssembly;
    try {
      assembly = new ServiceAssembly();
    } catch (error) {
      process.stderr.write(`tracevault: cannot load rules: ${this.message(error)}\n`);
      return 1;
    }
    mkdirSync(dirname(dbPath), { recursive: true });
    const { service, store } = assembly.open(dbPath);
    const timelineView = new TimelineView();
    const server = new DashboardServer(
      service,
      new SessionListView(),
      timelineView,
      new ActivityView(),
      undefined,
      new SessionPageView(
        new SessionHeaderView(),
        [new SkippedCallsView(), new FindingsPanelView(), new FileRailView(), timelineView, new WaterfallView(), new GraphView(), new SubagentPortalView(), new ReplayBarView()],
        new DetailPaneView(),
      ),
    );

    let importLine: string;
    try {
      importLine = new HistoryImportCommand().run(store);
    } catch (error) {
      importLine = `history import skipped: ${this.message(error)}`;
    }

    try {
      const listening = await server.listen(port);
      process.stdout.write(`${importLine}\ntracevault listening on http://127.0.0.1:${listening}\nevents db: ${dbPath}\n`);
      return 0;
    } catch (error) {
      store.close();
      if (typeof error === "object" && error !== null && "code" in error && error.code === "EADDRINUSE") {
        process.stderr.write(`tracevault: port ${port} is already in use\n`);
        return 1;
      }
      process.stderr.write(`tracevault: failed to start: ${this.message(error)}\n`);
      return 1;
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
