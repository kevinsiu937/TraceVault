import type { ConfigFinding } from "../schema/ConfigFinding.js";
import type { Finding } from "../schema/Finding.js";
import type { InvestigationServicePort } from "../service/InvestigationServicePort.js";
import type { RuleChoice, RuleVersions } from "../service/RuleHistoryPort.js";
import type { SessionSummary } from "../service/SessionSummary.js";
import type { TimelineEntry } from "../service/TimelineEntry.js";
import { PlainWords } from "./PlainWords.js";
import { ReportConfigurationView } from "./ReportConfigurationView.js";
import { ReportEventsView } from "./ReportEventsView.js";
import { ReportFindingsView } from "./ReportFindingsView.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const GLOSSARY: readonly [string, string][] = [
  ["AI agent", "A program that uses an AI model to carry out tasks on a computer, such as running commands and editing files."],
  ["Session", "One conversation with the agent, from the first request to the last answer."],
  ["Command", "An instruction typed to the computer. Commands can read, change or delete files."],
  ["Settings file (opencode.json)", "The file that says what the agent may do on its own and what it must ask a person about first."],
  ["Built-in setting", "What OpenCode, the agent program, allows when the settings file says nothing."],
  ["Password or key file", "A file such as .env or id_rsa that holds passwords or keys to other systems."],
  ["Sending data out", "Any action that can carry information off the computer, such as fetching a web page."],
  ["Add-on (MCP server)", "An extra program, usually written by someone else, that gives the agent more tools."],
  ["Rule", "A written check TraceVault applies. Every risk in this report names the rule that found it."],
  ["Skipped action", "An action TraceVault's safety check stopped before it happened."],
];

/**
 * One session as a self-contained HTML document (ADR 0005), written for a
 * reader with no IT background: a plain summary first, every risk with what
 * to do, the full record, and a glossary. No script, no URL to fetch, links
 * only to anchors in the file, and no generation time, so the same session
 * always gives the same bytes.
 */
export class ReportView {
  constructor(
    private readonly findings: ReportFindingsView = new ReportFindingsView(),
    private readonly configuration: ReportConfigurationView = new ReportConfigurationView(),
    private readonly events: ReportEventsView = new ReportEventsView(),
    private readonly words: PlainWords = new PlainWords(),
  ) {}

  render(service: InvestigationServicePort, sessionId: string, rules: RuleChoice = "now"): string {
    const summary = service.listSessions().find((session) => session.sessionId === sessionId);
    if (summary === undefined) {
      throw new Error(`no session '${sessionId}'`);
    }
    const entries = service.getTimeline(sessionId, undefined, rules);
    const findings = service.getFindings(sessionId, rules);
    const configFindings = service.getConfigFindings(sessionId, rules);
    const recorded = service.getConfiguration(sessionId) !== null;
    const titles = new Map([...findings, ...configFindings].map((finding) => [finding.ruleId, finding.title]));

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TraceVault report · ${this.escape(sessionId)}</title>
<style>${this.styles()}</style>
</head>
<body>
<main>
${this.header(summary, entries.length, [...findings, ...configFindings][0]?.ruleSetDigest)}
${this.rulesNotice(rules, service.getRuleVersions(sessionId))}
${this.inShort(entries, this.findings.needingALook(entries, findings), recorded, configFindings)}
${this.findings.render(entries, findings)}
${this.configuration.render(recorded, configFindings)}
${this.events.render(entries, titles)}
${this.glossary()}
</main>
</body>
</html>
`;
  }

  /** `actions` is the length of the full record, so the header and "Show all" agree. */
  private header(summary: SessionSummary, actions: number, digest: string | undefined): string {
    const end =
      summary.endedAt === null
        ? "still running, or its end was not recorded"
        : summary.endedAt.slice(0, 10) === summary.startedAt.slice(0, 10) // both are UTC ISO timestamps
          ? `<time datetime="${this.escape(summary.endedAt)}">${this.escape(this.words.clock(summary.endedAt))} UTC</time>`
          : this.when(summary.endedAt);
    const technical: [string, string][] = [
      ["Session", `<code>${this.escape(summary.sessionId)}</code>`],
      // shortcut: the digest comes from a finding, so a session no rule matched cannot name it; add a port method if a reader needs it there.
      ["Rule version", digest === undefined ? "No rule matched this session" : `<code>${this.escape(digest)}</code>`],
      ["Made by", "TraceVault, from recorded actions and written rules. Nothing here is a guess."],
    ];
    return `<header class="report-header">
<p class="eyebrow">TraceVault session report</p>
<h1>What an AI agent did</h1>
<p class="meta">Agent <strong>${this.escape(summary.agentName)}</strong> · ${this.when(summary.startedAt)} to ${end} · <strong>${actions}</strong> ${actions === 1 ? "action" : "actions"} recorded</p>
<details><summary>Technical details</summary>${this.terms(technical)}</details>
</header>`;
  }

  /** Four rows a reader can scan in seconds: each a question, its answer, and whether it needs attention. */
  private inShort(entries: readonly TimelineEntry[], findings: readonly Finding[], recorded: boolean, configFindings: readonly ConfigFinding[]): string {
    const skipped = entries.filter((entry) => entry.blockedBy !== null).length;
    const gaps = entries.filter((entry) => entry.type === "capture.gap" || entry.type === "guard.failure").length;
    const risks = new Set(configFindings.map((finding) => finding.ruleId)).size;
    const rows: [string, string, "ok" | "check" | "unknown"][] = [
      ...(skipped === 0 ? [] : [["Stopped before it happened", this.count(skipped, "action"), "check"] as [string, string, "check"]]),
      ["Risky things the agent did", findings.length === 0 ? "None" : this.count(findings.length, "to check"), findings.length === 0 ? "ok" : "check"],
      ["Risky settings", !recorded ? "Not recorded" : risks === 0 ? "None" : this.count(risks, "to fix"), !recorded ? "unknown" : risks === 0 ? "ok" : "check"],
      ["The record", gaps === 0 ? "Complete" : `${this.count(gaps, "gap")}, some actions may be missing`, gaps === 0 ? "ok" : "check"],
    ];
    return `<section class="in-short" id="in-short">
<h2>In short</h2>
<dl class="status">${rows.map(([label, value, state]) => `<div class="${state}"><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
</section>`;
  }

  /** One plain line when the rules matter, as on the session page; empty when then and now agree. */
  private rulesNotice(viewing: RuleChoice, versions: RuleVersions): string {
    const text =
      viewing === "then" && versions !== "unknown"
        ? "These findings use the rules from when this session was recorded."
        : versions === "different"
          ? "These findings use today's rules. The rules from when this session was recorded give a different result."
          : versions === "unknown"
            ? "The rules from when this session was recorded were not kept, so these findings use today's rules."
            : "";
    return text === "" ? "" : `<p class="rules-notice">${text}</p>`;
  }

  private glossary(): string {
    return `<section class="glossary" id="glossary">
<details><summary>What the words mean</summary>${this.terms(GLOSSARY)}</details>
</section>`;
  }

  private terms(rows: readonly (readonly [string, string])[]): string {
    return `<dl>${rows.map(([term, value]) => `<dt>${term}</dt><dd>${value}</dd>`).join("")}</dl>`;
  }

  /** "1 action", "3 actions", "2 to check", "1 gap". */
  private count(n: number, noun: string): string {
    return `${n} ${noun}${n === 1 || noun.startsWith("to ") ? "" : "s"}`;
  }

  private when(iso: string): string {
    return `<time datetime="${this.escape(iso)}">${this.escape(this.words.dateTime(iso))}</time>`;
  }

  /** Minimal, high-contrast and readable (ui-ux-pro-max "Minimalism & Swiss Style", slate palette), with system fonts so nothing is fetched. */
  private styles(): string {
    return `:root{--bg:#f8fafc;--card:#fff;--text:#0f172a;--muted:#475569;--line:#cbd5e1;--soft:#e9eef5;--ring:#1e3a5f;--bad:#b91c1c;--bad-bg:#fef2f2;--warn:#a16207;--warn-bg:#fefce8;--good:#15803d;--good-bg:#f0fdf4}
@media (prefers-color-scheme:dark){:root{--bg:#0b1120;--card:#111827;--text:#e2e8f0;--muted:#94a3b8;--line:#334155;--soft:#1e293b;--ring:#93c5fd;--bad:#fca5a5;--bad-bg:#2a1215;--warn:#fcd34d;--warn-bg:#2a2110;--good:#86efac;--good-bg:#0f2417}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 48px}
.eyebrow{margin:0;color:var(--muted);font-size:13px;letter-spacing:.04em;text-transform:uppercase}
h1{font-size:28px;line-height:1.25;margin:4px 0 8px}
h2{font-size:18px;line-height:1.3;margin:36px 0 12px}
h3{font-size:15px;margin:20px 0 8px}
.meta{margin:0 0 8px;color:var(--muted)}.meta strong{color:var(--text)}
p{margin:0 0 8px}
.status{margin:0;border:1px solid var(--line);border-radius:10px;background:var(--card);overflow:hidden}
.status div{display:flex;justify-content:space-between;gap:16px;padding:12px 16px;border-top:1px solid var(--line)}.status div:first-child{border-top:0}
.status dt{color:var(--text)}.status dd{margin:0;font-weight:600;text-align:right}
.status .ok dd{color:var(--good)}.status .check dd{color:var(--bad)}.status .unknown dd{color:var(--warn)}
ol,ul{margin:0;padding:0;list-style:none}
.findings>ol>li,.configuration>ol>li,.skipped>ul>li{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:0 0 10px}
.skipped>ul>li{border-left:4px solid var(--warn)}
li strong{font-weight:600}
.severity{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;vertical-align:2px;background:var(--soft);color:var(--muted)}
.severity.high{background:var(--bad-bg);color:var(--bad)}.severity.medium{background:var(--warn-bg);color:var(--warn)}
.todo{margin:6px 0 0}
.applies{margin:4px 0 0;color:var(--muted);font-size:14px}
details{margin-top:8px}summary{cursor:pointer;color:var(--muted);font-size:14px;width:max-content}summary:hover{color:var(--text)}
details[open]>summary{margin-bottom:8px}
details>:not(summary){font-size:15px}details ul{list-style:disc;padding-left:20px}details li{margin:2px 0}
.rule,.developer{color:var(--muted);font-size:13px}
a{color:inherit;text-underline-offset:2px}
:focus-visible{outline:2px solid var(--ring);outline-offset:2px;border-radius:4px}
code{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere}
.report-header dl,.glossary dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0;font-size:14px}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}
.status dt{color:var(--text)}
table{width:100%;border-collapse:collapse;font-size:14px;background:var(--card)}th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-weight:600;font-size:13px}
td.time{white-space:nowrap;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}td.target{overflow-wrap:anywhere;white-space:pre-wrap}
td.outcome.denied,td.outcome.error{color:var(--bad);font-weight:600}
tr:target{outline:2px solid var(--ring)}
.glossary{margin-top:36px}
.rules-notice{margin:16px 0 0;padding:10px 14px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--muted);font-size:14px}
@media (max-width:480px){h1{font-size:24px}.status div{flex-direction:column;gap:2px}.status dd{text-align:left}}
@media print{body{background:#fff;font-size:12px}main{max-width:none;padding:0}li,tr{break-inside:avoid}}`;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
