import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HookPayloadParser } from "../capture/HookPayloadParser.js";
import { PayloadDigest } from "../capture/PayloadDigest.js";
import { PluginHookCapture } from "../capture/PluginHookCapture.js";
import { ToolClassifier } from "../capture/ToolClassifier.js";
import type { WorkflowScannerPort } from "../scanner/dynamic/WorkflowScannerPort.js";
import { ConfigRuleLoader } from "../scanner/static/ConfigRuleLoader.js";
import { StaticScanner } from "../scanner/static/StaticScanner.js";
import { EventFactory } from "../schema/EventFactory.js";
import { InvestigationService } from "../service/InvestigationService.js";
import { SessionConfiguration } from "../service/SessionConfiguration.js";
import { SessionFindings } from "../service/SessionFindings.js";
import { TimelineBuilder } from "../service/TimelineBuilder.js";
import { SqliteEventStore } from "../store/SqliteEventStore.js";
import { WorkflowScannerAssembly } from "./WorkflowScannerAssembly.js";

const RULES_DIR = fileURLToPath(new URL("../../rules", import.meta.url));

/**
 * The investigation service over one database, with both rule sets loaded.
 * Rules load when this is built, so a broken rule file fails before any
 * database is opened.
 */
export class ServiceAssembly {
  private readonly scanner: WorkflowScannerPort;
  private readonly configuration: SessionConfiguration;

  constructor(rulesDir: string = RULES_DIR) {
    this.scanner = new WorkflowScannerAssembly().fromDirectory(rulesDir);
    this.configuration = new SessionConfiguration(new StaticScanner(new ConfigRuleLoader().loadDirectory(join(rulesDir, "config"))));
  }

  open(dbPath: string): { readonly service: InvestigationService; readonly store: SqliteEventStore } {
    const store = new SqliteEventStore(dbPath);
    const factory = new EventFactory();
    const capture = new PluginHookCapture(new HookPayloadParser(), new ToolClassifier(new PayloadDigest()), factory);
    const service = new InvestigationService(capture, store, factory, new TimelineBuilder(), new SessionFindings(this.scanner), this.configuration);
    return { service, store };
  }
}
