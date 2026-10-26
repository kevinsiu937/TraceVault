import type { SessionSummary } from "../service/SessionSummary.js";
import { DashboardStyle } from "./DashboardStyle.js";
import { SessionStreak } from "./SessionStreak.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export class SessionListView {
  constructor(
    private readonly style: DashboardStyle = new DashboardStyle(),
    private readonly streaks: SessionStreak = new SessionStreak(),
  ) {}

  render(sessions: readonly SessionSummary[]): string {
    // Subagents appear only in their parent's portal, never as peer rows.
    const roots = sessions.filter((session) => session.parentSessionId === null);
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
${roots.length === 0 ? "<div class=\"card empty\">No sessions captured yet.</div>" : `${this.renderStreaks(roots)}${this.renderTable(roots)}`}
</main>
</body>
</html>
`;
  }

  private renderTable(sessions: readonly SessionSummary[]): string {
    const rows = sessions.map((session) => this.renderRow(session)).join("\n");

    return `<div class="card">
<table>
<thead><tr><th>Session</th><th>Agent</th><th>Started</th><th>Density</th><th class="right">Events</th><th class="right">Files</th><th class="right">Errors</th><th class="right">Denied</th><th class="right">Duration</th><th>Status</th><th>Outcome</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>`;
  }

  private renderRow(session: SessionSummary): string {
    const label = session.title.length > 0 ? session.title : session.sessionId;
    const secondary = session.title.length > 0
      ? `<div class="muted mono">${this.escapeHtml(session.sessionId)}</div>`
      : "";
    const status = session.gapCount > 0
      ? '<span class="pill gap">uncovered</span>'
      : session.endedAt === null
        ? '<span class="muted">—</span>'
        : `<span class="pill closed">${this.escapeHtml(session.endedAt)}</span>`;
    const badge = this.badge(session);
    return `<tr data-session-id="${this.escapeHtml(session.sessionId)}"><td><a href="/sessions/${encodeURIComponent(session.sessionId)}">${this.escapeHtml(label)}</a>${secondary}</td><td class="muted">${this.escapeHtml(session.agentName)}</td><td class="muted mono">${this.escapeHtml(session.startedAt)}</td><td>${this.sparkline(session.density)}</td><td class="right mono">${session.eventCount}</td><td class="right mono">${session.filesTouched}</td><td class="right mono">${session.errorCount}</td><td class="right mono">${session.deniedCount}</td><td class="right mono">${this.duration(session.durationMs)}</td><td>${status}</td><td><span class="pill ${badge.className}">${badge.label}</span></td></tr>`;
  }

  private renderStreaks(sessions: readonly SessionSummary[]): string {
    return this.streaks
      .find(sessions)
      .map((run) => {
        const items = run
          .map((session) => {
            const label = session.title.length > 0 ? session.title : session.sessionId;
            const secondary = session.title.length > 0
              ? ` <span class="mono muted">${this.escapeHtml(session.sessionId)}</span>`
              : "";
            return `<li><a href="/sessions/${encodeURIComponent(session.sessionId)}">${this.escapeHtml(label)}</a>${secondary}</li>`;
          })
          .join("");
        return `<section class="card streak" role="status">
<p>⚠ ${run.length} sessions in a row ended with errors</p>
<ul>${items}</ul>
</section>
`;
      })
      .join("");
  }

  private sparkline(density: readonly number[]): string {
    const busiest = Math.max(0, ...density);
    const bars = Array.from({ length: 12 }, (_, index) => {
      const count = density[index] ?? 0;
      const height = busiest === 0 || count === 0 ? 0 : Math.max(1, Math.round((count / busiest) * 16));
      return `<rect x="${index * 4}" y="${16 - height}" width="3" height="${height}"/>`;
    }).join("");
    return `<svg class="spark" viewBox="0 0 48 16" aria-hidden="true">${bars}</svg>`;
  }

  private duration(ms: number | null): string {
    if (ms === null) {
      return "—";
    }
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  private badge(session: SessionSummary): { className: string; label: string } {
    if (session.endedAt === null) {
      return { className: "open", label: "open" };
    }
    if (session.deniedCount >= 3 && session.deniedCount > session.errorCount) {
      return { className: "denied", label: "denied-heavy" };
    }
    if (session.errorCount > 0) {
      return { className: "error", label: "has errors" };
    }
    return { className: "ok", label: "clean" };
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
