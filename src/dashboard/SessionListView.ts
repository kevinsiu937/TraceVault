import { DashboardStyle } from "./DashboardStyle.js";
import type { SessionSummary } from "../service/SessionSummary.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export class SessionListView {
  constructor(private readonly style: DashboardStyle = new DashboardStyle()) {}

  render(sessions: readonly SessionSummary[]): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${this.style.render()}
<title>TraceVault</title>
</head>
<body>
<main>
<header class="top">
<div>
<h1>TraceVault</h1>
<p class="sub">Local agent activity · loopback only</p>
</div>
<a class="back" href="/activity">Activity across sessions →</a>
</header>
${sessions.length === 0 ? "<div class=\"card empty\">No sessions captured yet.</div>" : this.renderTable(sessions)}
</main>
</body>
</html>
`;
  }

  private renderTable(sessions: readonly SessionSummary[]): string {
    const rows = sessions
      .map((session) => {
        const open = session.endedAt === null;
        const label = session.title.length > 0 ? session.title : session.sessionId;
        const secondary = session.title.length > 0
          ? `<div class="muted mono">${this.escapeHtml(session.sessionId)}</div>`
          : "";
        return `<tr><td><a href="/sessions/${encodeURIComponent(session.sessionId)}">${this.escapeHtml(label)}</a>${secondary}</td><td class="muted">${this.escapeHtml(session.agentName)}</td><td class="muted mono">${this.escapeHtml(session.startedAt)}</td><td><span class="pill ${open ? "open" : "closed"}">${open ? "open" : this.escapeHtml(session.endedAt ?? "")}</span></td><td class="right mono">${session.eventCount}</td></tr>`;
      })
      .join("\n");

    return `<div class="card">
<table>
<thead><tr><th>Session</th><th>Agent</th><th>Started</th><th>Status</th><th class="right">Actions</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>`;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
