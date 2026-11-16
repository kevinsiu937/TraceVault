import type { ConfigFinding, RuleSource } from "../schema/ConfigFinding.js";
import type { ConfigurationSnapshot } from "../service/ConfigurationSnapshot.js";
import { AcceptancesView } from "./AcceptancesView.js";
import { PlainWords } from "./PlainWords.js";
import { HtmlText } from "./HtmlText.js";

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
  constructor(
    private readonly words: PlainWords = new PlainWords(),
    private readonly acceptances: AcceptancesView = new AcceptancesView(words),
  ) {}

  render(recorded: boolean, findings: readonly ConfigFinding[], acceptances: ConfigurationSnapshot["acceptances"] = []): string {
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
${this.acceptances.render(acceptances)}
</section>`;
  }

  private group(group: readonly ConfigFinding[]): string {
    const [first] = group;
    if (first === undefined) {
      return "";
    }
    const subjects = group.map((finding) => `<code>${HtmlText.escape(finding.subject)}</code>`);
    const examples = new Map<string, string>();
    for (const item of group.flatMap((finding) => finding.evidence)) {
      const where = item.entry === "OpenCode default" ? "allowed by OpenCode's built-in setting, which the settings file does not change" : `allowed in the settings file at <code>${HtmlText.escape(item.entry)}</code>`;
      examples.set(`${item.value}\u0000${item.entry}`, `<li><code>${HtmlText.escape(item.value)}</code>${item.label === undefined ? "" : ` (${HtmlText.escape(item.label)})`}, ${where}</li>`);
    }
    const source = [SOURCE_NAMES[first.source.kind], first.source.id, first.source.title].filter((part) => part !== undefined && part.length > 0).join(" ");
    const kind = SUBJECTS[first.subjectKind];
    const advice = this.words.advice(first.recommendation);
    const details = [
      `<p>${HtmlText.escape(first.explanation)}</p>`,
      advice.developer === null ? "" : `<p class="developer">For the developer: ${HtmlText.escape(advice.developer)}</p>`,
      `<p>Examples of what this allows without asking:</p><ul>${[...examples.values()].join("")}</ul>`,
      `<p class="rule">Based on: ${HtmlText.escape(source)}. Rule: ${HtmlText.escape(first.ruleId)}.</p>`,
    ];
    return `<li class="config-finding" data-rule="${HtmlText.escape(first.ruleId)}"><strong>${HtmlText.escape(first.title)}</strong> <span class="severity ${HtmlText.escape(first.severity)}">${HtmlText.escape(this.words.severity(first.severity))}</span>
<p class="applies">Applies to the ${group.length === 1 ? kind : `${kind}s`} ${this.list(subjects)}.</p>
<p class="todo">What to do: ${HtmlText.escape(advice.plain)}</p>
<details><summary>Explain more</summary>${details.filter((part) => part.length > 0).join("")}</details></li>`;
  }

  /** "a", "a and b", "a, b and c". */
  private list(items: readonly string[]): string {
    return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  }
}
