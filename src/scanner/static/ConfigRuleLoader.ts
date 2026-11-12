import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import type { ConfigSubjectKind, RuleSource, RuleSourceKind } from "../../schema/ConfigFinding.js";
import type { Severity } from "../../schema/Finding.js";
import { RuleLoadError } from "../rules/RuleLoadError.js";
import { RuleYaml } from "../rules/RuleYaml.js";
import { type ConfigAlternative, type ConfigCheck, ConfigRule, type MatchFact } from "./ConfigRule.js";
import type { ConfigRuleSet } from "./StaticScanner.js";

const RULE_KEYS = ["id", "version", "severity", "title", "explanation", "recommendation", "source", "subject", "when"];
const SEVERITIES: readonly Severity[] = ["low", "medium", "high"];
const SOURCE_KINDS: readonly RuleSourceKind[] = ["owasp-mcp", "owasp-agentic", "cve", "baseline"];
const SUBJECTS: readonly ConfigSubjectKind[] = ["agent", "mcp-server", "tool"];
const CHECKS = ["allows", "remote_mcp", "match"];
// allows and remote_mcp ask about an agent; match tests the facts of a server or a tool.
const AGENT_CHECKS = ["allows", "remote_mcp"];
const FACTS: Readonly<Record<ConfigSubjectKind, readonly MatchFact[]>> = { agent: [], "mcp-server": ["secret_keys"], tool: ["text"] };

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
    const title = this.string(fields, "title", file);
    const explanation = this.string(fields, "explanation", file);
    const recommendation = this.string(fields, "recommendation", file);
    const subject = this.oneOf(fields, "subject", SUBJECTS, file) as ConfigSubjectKind;
    return new ConfigRule(id, version, severity, title, explanation, recommendation, this.source(fields, file), subject, this.when(fields, file, subject));
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

  /** Each item is one check, or `any` of several labelled ones. */
  private when(fields: Fields, file: string, subject: ConfigSubjectKind): ConfigAlternative[][] {
    const when = this.required(fields, "when", file);
    if (!Array.isArray(when) || when.length === 0) {
      throw new RuleLoadError(file, "when", "must be a non-empty list");
    }
    return when.map((item, index) => {
      const field = `when[${index}]`;
      const entry = this.object(item, file, field);
      if (!Object.hasOwn(entry, "any")) {
        return [{ check: this.check(entry, file, field, subject) }];
      }
      this.onlyKeys(entry, ["any"], file, `${field}.`);
      const alternatives = entry["any"];
      if (!Array.isArray(alternatives) || alternatives.length === 0) {
        throw new RuleLoadError(file, `${field}.any`, "must be a non-empty list");
      }
      return alternatives.map((alternative, position) => {
        const at = `${field}.any[${position}]`;
        const fields = this.object(alternative, file, at);
        const label = this.string(fields, "label", file, `${at}.`);
        const { label: _, ...check } = fields;
        return { label, check: this.check(check, file, at, subject) };
      });
    });
  }

  private check(fields: Fields, file: string, field: string, subject: ConfigSubjectKind): ConfigCheck {
    const [kind, ...extra] = Object.keys(fields);
    if (kind === undefined || extra.length > 0 || !CHECKS.includes(kind)) {
      throw new RuleLoadError(file, field, `must be one check: ${CHECKS.join(", ")}, or any`);
    }
    if (AGENT_CHECKS.includes(kind) !== (subject === "agent")) {
      throw new RuleLoadError(file, field, kind === "match" ? "match needs subject mcp-server or tool" : `${kind} needs subject agent`);
    }
    if (kind === "remote_mcp") {
      if (fields[kind] !== true) {
        throw new RuleLoadError(file, `${field}.remote_mcp`, "must be true");
      }
      return { kind: "remote_mcp" };
    }
    if (kind === "match") {
      return this.match(this.object(fields[kind], file, `${field}.match`), file, `${field}.match`, FACTS[subject]);
    }
    const allows = this.object(fields[kind], file, `${field}.allows`);
    this.onlyKeys(allows, ["permission", "target", "configured"], file, `${field}.allows.`);
    const permission = this.string(allows, "permission", file, `${field}.allows.`);
    const target = this.required(allows, "target", file, `${field}.allows.`);
    const targets = typeof target === "string" ? [target] : target;
    if (!Array.isArray(targets) || targets.length === 0 || !targets.every((one) => typeof one === "string" && one.length > 0)) {
      throw new RuleLoadError(file, `${field}.allows.target`, "must be an example or a non-empty list of examples");
    }
    const configured = allows["configured"] ?? false;
    if (typeof configured !== "boolean") {
      throw new RuleLoadError(file, `${field}.allows.configured`, "must be true or false");
    }
    return { kind: "allows", permission, targets: targets as string[], configured };
  }

  private match(match: Fields, file: string, field: string, facts: readonly MatchFact[]): ConfigCheck {
    const [fact, ...extra] = Object.keys(match);
    if (fact === undefined || extra.length > 0) {
      throw new RuleLoadError(file, field, "must name exactly one fact");
    }
    const known = facts.find((candidate) => candidate === fact);
    if (known === undefined) {
      throw new RuleLoadError(file, `${field}.${fact}`, `unknown fact; this subject has ${facts.join(", ")}`);
    }
    const operator = this.object(match[fact], file, `${field}.${fact}`);
    if (Object.keys(operator).length !== 1 || !Object.hasOwn(operator, "regex")) {
      throw new RuleLoadError(file, `${field}.${fact}`, "must be { regex: <pattern> }, the one operator configuration facts support");
    }
    const source = this.string(operator, "regex", file, `${field}.${fact}.`);
    try {
      // "u" so a rule can name characters beyond U+FFFF, such as the Unicode tag block.
      return { kind: "match", fact: known, pattern: new RegExp(source, "iu") };
    } catch (error) {
      throw new RuleLoadError(file, `${field}.${fact}.regex`, error instanceof Error ? error.message : String(error));
    }
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
