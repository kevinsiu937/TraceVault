import { join } from "node:path";
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
import { RulesNoticeView } from "../dashboard/RulesNoticeView.js";
import { SessionHeaderView } from "../dashboard/SessionHeaderView.js";
import { SessionListView } from "../dashboard/SessionListView.js";
import { SessionPageView } from "../dashboard/SessionPageView.js";
import { SkippedCallsView } from "../dashboard/SkippedCallsView.js";
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
import type { RuleSetScanners } from "../service/RuleHistoryPort.js";
import { SqliteEventStore } from "../store/SqliteEventStore.js";
import { SqliteRuleSetStore } from "../store/SqliteRuleSetStore.js";
import { StoredRuleHistory } from "./StoredRuleHistory.js";
import { WorkflowScannerAssembly } from "./WorkflowScannerAssembly.js";

const RULES_DIR = fileURLToPath(new URL("../../rules", import.meta.url));

/**
 * The investigation service and its dashboard over one database, with both
 * rule sets loaded. `run`, the report, the probe scripts and the seam tests
 * all build them here, so they exercise the same wiring.
 * Rules load when this is built, so a broken rule file fails before any
 * database is opened.
 */
export class ServiceAssembly {
  private readonly now: RuleSetScanners;
  private readonly rules: ReturnType<typeof StoredRuleHistory.read>;

  constructor(rulesDir: string = RULES_DIR) {
    this.now = ServiceAssembly.scannersFrom(rulesDir);
    this.rules = StoredRuleHistory.read(rulesDir);
  }

  /** Both scanners from one rules directory: workflow rules at its top, configuration rules in `config/`. */
  private static scannersFrom(rulesDir: string): RuleSetScanners {
    const scanner: WorkflowScannerPort = new WorkflowScannerAssembly().fromDirectory(rulesDir);
    return {
      findings: new SessionFindings(scanner),
      configuration: new SessionConfiguration(new StaticScanner(new ConfigRuleLoader().loadDirectory(join(rulesDir, "config")))),
    };
  }

  /** `printError` receives the line the dashboard prints for a request it could not handle. */
  open(
    dbPath: string,
    printError?: (line: string) => void,
  ): { readonly service: InvestigationService; readonly store: SqliteEventStore; readonly server: DashboardServer } {
    const store = new SqliteEventStore(dbPath);
    const factory = new EventFactory();
    const capture = new PluginHookCapture(new HookPayloadParser(), new ToolClassifier(new PayloadDigest()), factory);
    const history = new StoredRuleHistory(new SqliteRuleSetStore(dbPath), this.rules.digest, this.rules.files, (directory) => ServiceAssembly.scannersFrom(directory));
    const service = new InvestigationService(capture, store, factory, new TimelineBuilder(), this.now.findings, this.now.configuration, history);
    const timelineView = new TimelineView();
    const server = new DashboardServer(
      service,
      new SessionListView(),
      timelineView,
      new ActivityView(),
      new SessionPageView(
        new SessionHeaderView(),
        [new RulesNoticeView(), new SkippedCallsView(), new FindingsPanelView(), new FileRailView(), timelineView, new WaterfallView(), new GraphView(), new SubagentPortalView(), new ReplayBarView()],
        new DetailPaneView(),
      ),
      undefined,
      undefined,
      printError,
    );
    return { service, store, server };
  }
}
