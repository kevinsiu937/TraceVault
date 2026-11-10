import { PayloadDigest } from "../capture/PayloadDigest.js";
import { ToolClassifier } from "../capture/ToolClassifier.js";
import { CallGuard } from "../plugin/CallGuard.js";
import { EventFactory } from "../schema/EventFactory.js";
import { WorkflowScannerAssembly } from "./WorkflowScannerAssembly.js";

/**
 * Builds the opt-in guard. The plugin loader `init --block` writes calls this,
 * so the guard classifies a pending call and loads rules exactly as capture and
 * the service do. The rules load on the first call, inside the guard, so a
 * broken rule set fails open instead of failing the plugin.
 */
export class GuardAssembly {
  fromDirectory(directory: string): CallGuard {
    return new CallGuard(
      () => new WorkflowScannerAssembly().fromDirectory(directory),
      new ToolClassifier(new PayloadDigest()),
      new EventFactory(),
    );
  }
}
