import { AllowedByCondition } from "../scanner/dynamic/AllowedByCondition.js";
import { ConditionRegistry } from "../scanner/dynamic/ConditionRegistry.js";
import { EqualsCondition } from "../scanner/dynamic/EqualsCondition.js";
import { GlobCondition } from "../scanner/dynamic/GlobCondition.js";
import { InCondition } from "../scanner/dynamic/InCondition.js";
import { InvokesCondition } from "../scanner/dynamic/InvokesCondition.js";
import { NamesCondition } from "../scanner/dynamic/NamesCondition.js";
import { OtherThanCondition } from "../scanner/dynamic/OtherThanCondition.js";
import { OutsideCondition } from "../scanner/dynamic/OutsideCondition.js";
import { RegexCondition } from "../scanner/dynamic/RegexCondition.js";
import { RunsCondition } from "../scanner/dynamic/RunsCondition.js";
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
      names: NamesCondition.parse,
      regex: RegexCondition.parse,
      outside: OutsideCondition.parse,
      allowed_by: AllowedByCondition.parse,
      other_than: OtherThanCondition.parse,
      invokes: InvokesCondition.parse,
      runs: RunsCondition.parse,
    });
    return new WorkflowScanner(new RuleSetLoader(conditions).load(directory));
  }
}
