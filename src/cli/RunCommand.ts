import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HookPayloadParser } from "../capture/HookPayloadParser.js";
import { PayloadDigest } from "../capture/PayloadDigest.js";
import { PluginHookCapture } from "../capture/PluginHookCapture.js";
import { ToolClassifier } from "../capture/ToolClassifier.js";
import { ActivityView } from "../dashboard/ActivityView.js";
import { DashboardServer } from "../dashboard/DashboardServer.js";
import { DetailPaneView } from "../dashboard/DetailPaneView.js";
import { FileRailView } from "../dashboard/FileRailView.js";
import { FindingsPanelView } from "../dashboard/FindingsPanelView.js";
import { GraphView } from "../dashboard/GraphView.js";
import { ReplayBarView } from "../dashboard/ReplayBarView.js";
import { SessionHeaderView } from "../dashboard/SessionHeaderView.js";
import { SessionListView } from "../dashboard/SessionListView.js";
import { SessionPageView } from "../dashboard/SessionPageView.js";
import { SubagentPortalView } from "../dashboard/SubagentPortalView.js";
import { TimelineView } from "../dashboard/TimelineView.js";
import { WaterfallView } from "../dashboard/WaterfallView.js";
import type { WorkflowScannerPort } from "../scanner/dynamic/WorkflowScannerPort.js";
import { ConfigRuleLoader } from "../scanner/static/ConfigRuleLoader.js";
import { StaticScanner } from "../scanner/static/StaticScanner.js";
import { EventFactory } from "../schema/EventFactory.js";
import { InvestigationService } from "../service/InvestigationService.js";
import { SessionConfiguration } from "../service/SessionConfiguration.js";
import { SessionFindings } from "../service/SessionFindings.js";
import { TimelineBuilder } from "../service/TimelineBuilder.js";
import { SqliteEventStore } from "../store/SqliteEventStore.js";
import { HistoryImportCommand } from "./HistoryImportCommand.js";
import { WorkflowScannerAssembly } from "./WorkflowScannerAssembly.js";

const RULES_DIR = fileURLToPath(new URL("../../rules", import.meta.url));

/** Assembles the local service (capture, scanners, dashboard) and starts it on 127.0.0.1. */
export class RunCommand {
  async run(port: number, dbPath: string): Promise<number> {
    let scanner: WorkflowScannerPort;
    let configuration: SessionConfiguration;
    try {
      scanner = new WorkflowScannerAssembly().fromDirectory(RULES_DIR);
      configuration = new SessionConfiguration(new StaticScanner(new ConfigRuleLoader().loadDirectory(join(RULES_DIR, "config"))));
    } catch (error) {
      process.stderr.write(`tracevault: cannot load rules: ${this.message(error)}\n`);
      return 1;
    }
    mkdirSync(dirname(dbPath), { recursive: true });
    const store = new SqliteEventStore(dbPath);
    const factory = new EventFactory();
    const capture = new PluginHookCapture(new HookPayloadParser(), new ToolClassifier(new PayloadDigest()), factory);
    const service = new InvestigationService(capture, store, factory, new TimelineBuilder(), new SessionFindings(scanner), configuration);
    const timelineView = new TimelineView();
    const server = new DashboardServer(
      service,
      new SessionListView(),
      timelineView,
      new ActivityView(),
      undefined,
      new SessionPageView(
        new SessionHeaderView(),
        [new FindingsPanelView(), new FileRailView(), timelineView, new WaterfallView(), new GraphView(), new SubagentPortalView(), new ReplayBarView()],
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
