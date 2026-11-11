import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import type { RuleSource, RuleSourceKind } from "../../schema/ConfigFinding.js";
import type { Severity } from "../../schema/Finding.js";
import { RuleLoadError } from "../rules/RuleLoadError.js";
import { RuleYaml } from "../rules/RuleYaml.js";
import { type AllowsCheck, ConfigRule } from "./ConfigRule.js";
import type { ConfigRuleSet } from "./StaticScanner.js";

const RULE_KEYS = ["id", "version", "severity", "explanation", "source", "subject", "when"];
const SEVERITIES: readonly Severity[] = ["low", "medium", "high"];
const SOURCE_KINDS: readonly RuleSourceKind[] = ["owasp-mcp", "owasp-agentic", "cve", "baseline"];
// Later tickets add mcp-server and tool.
const SUBJECTS = ["agent"];

type Fields = Record<string, unknown>;

/**
 * Loads `rules/config/*.yaml` as strictly as the workflow rules: a typo is an
 * error naming the file and the field, never a silently ignored check.
 */
export class ConfigRuleLoader {
  constructor(private readonly yaml: RuleYaml = new RuleYaml()) {}

  loadDirectory(directory: string): ConfigRuleSet {
    const files = readdirSync(directory);
    const misnamed = files.find((file) => file.endsWith(".yml"));
    if (misnamed !== undefined) {
      throw new RuleLoadError(misnamed, "file name", `rename it to ${basename(misnamed, ".yml")}.yaml`);
    }
    const hash = createHash("sha256");
    const rules = files
      .filter((file) => file.endsWith(".yaml"))
      .sort()
      .map((file) => {
        const text = readFileSync(join(directory, file), "utf8");
        hash.update(`${file}\n${text}\n`);
        return this.load(file, text, basename(file, ".yaml"));
      });
    return { rules, digest: `sha256:${hash.digest("hex")}` };
  }

  load(file: string, text: string, expectedId: string): ConfigRule {
    const fields = this.object(this.yaml.parse(file, text), file, "rule");
    this.onlyKeys(fields, RULE_KEYS, file, "");
    const id = this.string(fields, "id", file);
    if (id !== expectedId) {
      throw new RuleLoadError(file, "id", `must match the file name ('${expectedId}')`);
    }
    const version = this.required(fields, "version", file);
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
      throw new RuleLoadError(file, "version", "must be a positive integer");
    }
    const severity = this.oneOf(fields, "severity", SEVERITIES, file) as Severity;
    const explanation = this.string(fields, "explanation", file);
    this.oneOf(fields, "subject", SUBJECTS, file);
    return new ConfigRule(id, version, severity, explanation, this.source(fields, file), this.checks(fields, file));
  }

  private source(fields: Fields, file: string): RuleSource {
    const source = this.object(this.required(fields, "source", file), file, "source");
    this.onlyKeys(source, ["kind", "id", "title"], file, "source.");
    const kind = this.oneOf(source, "kind", SOURCE_KINDS, file, "source.") as RuleSourceKind;
    const title = this.string(source, "title", file, "source.");
    if (kind === "baseline") {
      if (Object.hasOwn(source, "id")) {
        throw new RuleLoadError(file, "source.id", "the baseline has no published id");
      }
      return { kind, title };
    }
    return { kind, id: this.string(source, "id", file, "source."), title };
  }

  private checks(fields: Fields, file: string): readonly [AllowsCheck, ...AllowsCheck[]] {
    const when = this.required(fields, "when", file);
    if (!Array.isArray(when) || when.length === 0) {
      throw new RuleLoadError(file, "when", "must be a non-empty list");
    }
    const checks = when.map((item, index) => {
      const field = `when[${index}]`;
      const check = this.object(item, file, field);
      if (Object.keys(check).length !== 1 || !Object.hasOwn(check, "allows")) {
        throw new RuleLoadError(file, field, "must be { allows: { permission, target } }");
      }
      const allows = this.object(check["allows"], file, `${field}.allows`);
      this.onlyKeys(allows, ["permission", "target"], file, `${field}.allows.`);
      const permission = this.string(allows, "permission", file, `${field}.allows.`);
      const target = this.required(allows, "target", file, `${field}.allows.`);
      const targets = typeof target === "string" ? [target] : target;
      if (!Array.isArray(targets) || targets.length === 0 || !targets.every((one) => typeof one === "string" && one.length > 0)) {
        throw new RuleLoadError(file, `${field}.allows.target`, "must be an example or a non-empty list of examples");
      }
      return { permission, targets: targets as string[] };
    });
    const [first, ...rest] = checks;
    if (first === undefined) {
      throw new RuleLoadError(file, "when", "must be a non-empty list");
    }
    return [first, ...rest];
  }

  private onlyKeys(fields: Fields, allowed: readonly string[], file: string, prefix: string): void {
    const unknown = Object.keys(fields).find((key) => !allowed.includes(key));
    if (unknown !== undefined) {
      throw new RuleLoadError(file, `${prefix}${unknown}`, "unknown key");
    }
  }

  private oneOf(fields: Fields, key: string, allowed: readonly string[], file: string, prefix = ""): string {
    const value = this.string(fields, key, file, prefix);
    if (!allowed.includes(value)) {
      throw new RuleLoadError(file, `${prefix}${key}`, `must be one of ${allowed.join(", ")}`);
    }
    return value;
  }

  private object(value: unknown, file: string, field: string): Fields {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new RuleLoadError(file, field, "must be a mapping");
    }
    return value as Fields;
  }

  private required(fields: Fields, key: string, file: string, prefix = ""): unknown {
    if (!Object.hasOwn(fields, key)) {
      throw new RuleLoadError(file, `${prefix}${key}`, "required");
    }
    return fields[key];
  }

  private string(fields: Fields, key: string, file: string, prefix = ""): string {
    const value = this.required(fields, key, file, prefix);
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new RuleLoadError(file, `${prefix}${key}`, "must be a non-empty string");
    }
    return value;
  }
}
