import type { ConfigFinding, RuleSource } from "../schema/ConfigFinding.js";
import type { ConfigurationSnapshot } from "../service/ConfigurationSnapshot.js";
import { DashboardStyle } from "./DashboardStyle.js";
import { HtmlText } from "./HtmlText.js";

const SOURCE_NAMES: Record<RuleSource["kind"], string> = {
  "owasp-mcp": "OWASP MCP",
  "owasp-agentic": "OWASP Agentic",
  cve: "",
  baseline: "",
};

/** The configuration a session ran under, secrets already replaced, and the static findings on it. */
export class ConfigurationView {
  constructor(private readonly style: DashboardStyle = new DashboardStyle()) {}

  render(sessionId: string, title: string, snapshot: ConfigurationSnapshot | null, findings: readonly ConfigFinding[]): string {
    const name = title.length > 0 ? title : sessionId;
    const body = snapshot === null
      ? `<p class="empty">No configuration recorded. The session was imported from OpenCode's history, or captured before TraceVault recorded configurations.</p>`
      : `<p class="sub">Recorded <time datetime="${HtmlText.escape(snapshot.recordedAt)}">${HtmlText.escape(snapshot.recordedAt)}</time> · <code>${HtmlText.escape(snapshot.digest)}</code></p>
${this.findings(findings)}
${this.mcpTools(snapshot.mcpTools)}
<p class="sub">Secret values were replaced with <code>[redacted]</code> before they left OpenCode.</p>
<pre class="config-json">${HtmlText.escape(JSON.stringify(snapshot.config, null, 2))}</pre>`;

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
.mcp-server{margin:16px 0 0}
.mcp-server h3{font-size:15px;margin:0 0 6px}
.mcp-server ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.config-json{margin:16px 0 0;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--panel);font-size:12px;line-height:1.5;overflow:auto}
</style>
<title>TraceVault — Configuration — ${HtmlText.escape(name)}</title>
</head>
<body>
<main>
<a class="back" href="/sessions/${encodeURIComponent(sessionId)}">← ${HtmlText.escape(name)}</a>
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
        const subject = { agent: "Agent", "mcp-server": "MCP server", tool: "Tool" }[finding.subjectKind];
        const evidence = finding.evidence
          .map((item) => `<li>${item.label === undefined ? "" : `${HtmlText.escape(item.label)}: `}<code>${HtmlText.escape(item.value)}</code>, from <code>${HtmlText.escape(item.entry)}</code></li>`)
          .join("");
        return `<li class="config-finding" data-rule="${HtmlText.escape(finding.ruleId)}" data-severity="${finding.severity}"><span class="pill">${finding.severity}</span> <strong>${HtmlText.escape(finding.ruleId)}</strong> · ${HtmlText.escape(source)}
<p>${subject} <code>${HtmlText.escape(finding.subject)}</code>. ${HtmlText.escape(finding.explanation)}</p>
<p class="config-recommendation">What to do: ${HtmlText.escape(finding.recommendation)}</p><ul>${evidence}</ul></li>`;
      })
      .join("\n")}</ol>`;
  }

  private mcpTools(lists: ConfigurationSnapshot["mcpTools"]): string {
    if (lists.length === 0) {
      return `<p class="sub">No local MCP server listed tools in this session.</p>`;
    }
    return lists
      .map(({ server, tools }) => {
        const items = tools
          .map((tool) => {
            const name = typeof tool["name"] === "string" ? tool["name"] : "";
            const description = typeof tool["description"] === "string" ? tool["description"] : "";
            return `<li><details><summary><code>${HtmlText.escape(name)}</code></summary><p>${HtmlText.escape(description)}</p><pre class="config-json">${HtmlText.escape(JSON.stringify(tool["inputSchema"] ?? {}, null, 2))}</pre></details></li>`;
          })
          .join("");
        return `<section class="mcp-server"><h3><code>${HtmlText.escape(server)}</code> · ${tools.length} ${tools.length === 1 ? "tool" : "tools"}</h3><ul>${items}</ul></section>`;
      })
      .join("\n");
  }
}
