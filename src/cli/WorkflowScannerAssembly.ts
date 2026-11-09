import { ConditionRegistry } from "../scanner/dynamic/ConditionRegistry.js";
import { EqualsCondition } from "../scanner/dynamic/EqualsCondition.js";
import { GlobCondition } from "../scanner/dynamic/GlobCondition.js";
import { InCondition } from "../scanner/dynamic/InCondition.js";
import { OutsideCondition } from "../scanner/dynamic/OutsideCondition.js";
import { RegexCondition } from "../scanner/dynamic/RegexCondition.js";
import { RuleSetLoader } from "../scanner/dynamic/RuleSetLoader.js";
import { WorkflowScanner } from "../scanner/dynamic/WorkflowScanner.js";
import type { WorkflowScannerPort } from "../scanner/dynamic/WorkflowScannerPort.js";

/**
 * The one place the workflow scanner is assembled: which match operators exist
 * and where rules come from. Every caller that needs a scanner builds it here.
 */
export class WorkflowScannerAssembly {
  fromDirectory(directory: string): WorkflowScannerPort {
    const conditions = new ConditionRegistry({
      equals: EqualsCondition.parse,
      in: InCondition.parse,
      glob: GlobCondition.parse,
      regex: RegexCondition.parse,
      outside: OutsideCondition.parse,
    });
    return new WorkflowScanner(new RuleSetLoader(conditions).load(directory));
  }
}
