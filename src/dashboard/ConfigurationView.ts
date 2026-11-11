import type { ConfigFinding, RuleSource } from "../schema/ConfigFinding.js";
import type { ConfigurationSnapshot } from "../service/ConfigurationSnapshot.js";
import { DashboardStyle } from "./DashboardStyle.js";

const SOURCE_NAMES: Record<RuleSource["kind"], string> = {
  "owasp-mcp": "OWASP MCP",
  "owasp-agentic": "OWASP Agentic",
  cve: "",
  baseline: "",
};

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** The configuration a session ran under, secrets already replaced, and the static findings on it. */
export class ConfigurationView {
  constructor(private readonly style: DashboardStyle = new DashboardStyle()) {}

  render(sessionId: string, title: string, snapshot: ConfigurationSnapshot | null, findings: readonly ConfigFinding[]): string {
    const name = title.length > 0 ? title : sessionId;
    const body = snapshot === null
      ? `<p class="empty">No configuration recorded. The session was imported from OpenCode's history, or captured before TraceVault recorded configurations.</p>`
      : `<p class="sub">Recorded <time datetime="${this.escape(snapshot.recordedAt)}">${this.escape(snapshot.recordedAt)}</time> · <code>${this.escape(snapshot.digest)}</code></p>
${this.findings(findings)}
<p class="sub">Secret values were replaced with <code>[redacted]</code> before they left OpenCode.</p>
<pre class="config-json">${this.escape(JSON.stringify(snapshot.config, null, 2))}</pre>`;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${this.style.css()}
.config-findings{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:10px}
.config-finding{padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}
.config-finding p{margin:6px 0 0;color:var(--muted)}
.config-json{margin:16px 0 0;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--panel);font-size:12px;line-height:1.5;overflow:auto}
</style>
<title>TraceVault — Configuration — ${this.escape(name)}</title>
</head>
<body>
<main>
<a class="back" href="/sessions/${encodeURIComponent(sessionId)}">← ${this.escape(name)}</a>
<h1>Configuration</h1>
${body}
</main>
</body>
</html>
`;
  }

  private findings(findings: readonly ConfigFinding[]): string {
    if (findings.length === 0) {
      return `<p class="sub">No static rule matched this configuration.</p>`;
    }
    const order = ["high", "medium", "low"];
    const sorted = [...findings].sort((left, right) => order.indexOf(left.severity) - order.indexOf(right.severity));
    return `<ol class="config-findings">${sorted
      .map((finding) => {
        const source = [SOURCE_NAMES[finding.source.kind], finding.source.id, finding.source.title].filter((part) => part !== undefined && part.length > 0).join(" ");
        const subject = finding.subjectKind === "agent" ? "Agent" : "MCP server";
        const evidence = finding.evidence
          .map((item) => `<li>${item.label === undefined ? "" : `${this.escape(item.label)}: `}<code>${this.escape(item.value)}</code>, from <code>${this.escape(item.entry)}</code></li>`)
          .join("");
        return `<li class="config-finding" data-rule="${this.escape(finding.ruleId)}" data-severity="${finding.severity}"><span class="pill">${finding.severity}</span> <strong>${this.escape(finding.ruleId)}</strong> · ${this.escape(source)}
<p>${subject} <code>${this.escape(finding.subject)}</code>. ${this.escape(finding.explanation)}</p><ul>${evidence}</ul></li>`;
      })
      .join("\n")}</ol>`;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
