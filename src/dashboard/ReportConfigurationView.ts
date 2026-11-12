import type { ConfigFinding, RuleSource } from "../schema/ConfigFinding.js";
import { PlainWords } from "./PlainWords.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const SOURCE_NAMES: Record<RuleSource["kind"], string> = {
  "owasp-mcp": "OWASP MCP Top 10",
  "owasp-agentic": "OWASP Top 10 for Agentic Applications",
  cve: "",
  baseline: "",
};

const SUBJECTS: Record<ConfigFinding["subjectKind"], string> = { agent: "agent", "mcp-server": "add-on", tool: "add-on tool" };

/**
 * What the agent's settings let it do without asking. One entry per rule,
 * naming every agent or add-on it applies to, so one risk reads once.
 */
export class ReportConfigurationView {
  constructor(private readonly words: PlainWords = new PlainWords()) {}

  render(recorded: boolean, findings: readonly ConfigFinding[]): string {
    const groups = new Map<string, ConfigFinding[]>();
    for (const finding of findings) {
      groups.set(finding.ruleId, [...(groups.get(finding.ruleId) ?? []), finding]);
    }
    const order = ["high", "medium", "low"];
    const sorted = [...groups.values()].sort((left, right) => order.indexOf(left[0]?.severity ?? "low") - order.indexOf(right[0]?.severity ?? "low"));
    const body = !recorded
      ? "<p>Not known. TraceVault did not record this session's settings, so this report cannot say whether they were safe.</p>"
      : sorted.length === 0
        ? "<p>No risky settings found. None of TraceVault's setting rules matched what this agent was allowed to do.</p>"
        : `<p>These are not things the agent did, but things its settings let it do without asking a person.</p>\n<ol>\n${sorted.map((group) => this.group(group)).join("\n")}\n</ol>`;
    const heading = !recorded ? "unknown" : `${sorted.length} ${sorted.length === 1 ? "risk" : "risks"}`;
    return `<section class="configuration" id="configuration">
<h2>What the agent's settings allow without asking: ${heading}</h2>
${body}
</section>`;
  }

  private group(group: readonly ConfigFinding[]): string {
    const [first] = group;
    if (first === undefined) {
      return "";
    }
    const subjects = group.map((finding) => `<code>${this.escape(finding.subject)}</code>`);
    const examples = new Map<string, string>();
    for (const item of group.flatMap((finding) => finding.evidence)) {
      const where = item.entry === "OpenCode default" ? "allowed by OpenCode's built-in setting, which the settings file does not change" : `allowed in the settings file at <code>${this.escape(item.entry)}</code>`;
      examples.set(`${item.value}\u0000${item.entry}`, `<li><code>${this.escape(item.value)}</code>${item.label === undefined ? "" : ` (${this.escape(item.label)})`}, ${where}</li>`);
    }
    const source = [SOURCE_NAMES[first.source.kind], first.source.id, first.source.title].filter((part) => part !== undefined && part.length > 0).join(" ");
    const kind = SUBJECTS[first.subjectKind];
    const advice = this.words.advice(first.recommendation);
    const details = [
      `<p>${this.escape(first.explanation)}</p>`,
      advice.developer === null ? "" : `<p class="developer">For the developer: ${this.escape(advice.developer)}</p>`,
      `<p>Examples of what this allows without asking:</p><ul>${[...examples.values()].join("")}</ul>`,
      `<p class="rule">Based on: ${this.escape(source)}. Rule: ${this.escape(first.ruleId)}.</p>`,
    ];
    return `<li class="config-finding" data-rule="${this.escape(first.ruleId)}"><strong>${this.escape(first.title)}</strong> <span class="severity ${this.escape(first.severity)}">${this.escape(this.words.severity(first.severity))}</span>
<p class="applies">Applies to the ${group.length === 1 ? kind : `${kind}s`} ${this.list(subjects)}.</p>
<p class="todo">What to do: ${this.escape(advice.plain)}</p>
<details><summary>Explain more</summary>${details.filter((part) => part.length > 0).join("")}</details></li>`;
  }

  /** "a", "a and b", "a, b and c". */
  private list(items: readonly string[]): string {
    return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
