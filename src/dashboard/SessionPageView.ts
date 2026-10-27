import { DashboardStyle } from "./DashboardStyle.js";
import type { SessionHeaderRenderer } from "./SessionHeaderView.js";
import type { SessionPane, SessionPaneView } from "./SessionPaneView.js";
import type { SessionRenderContext } from "./SessionRenderContext.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * The cockpit shell. It knows four slots and the right-hand detail pane, and
 * nothing about the concrete views that fill them.
 */
export class SessionPageView {
  constructor(
    private readonly header: SessionHeaderRenderer,
    private readonly panes: readonly SessionPaneView[],
    private readonly detail: SessionPane,
    private readonly style: DashboardStyle = new DashboardStyle(),
  ) {}

  render(context: SessionRenderContext): string {
    const top = this.panes.filter((pane) => pane.slot === "top");
    const left = this.panes.filter((pane) => pane.slot === "left");
    const center = this.panes.filter((pane) => pane.slot === "center");
    const bottom = this.panes.filter((pane) => pane.slot === "bottom");
    const active = center.find((pane) => pane.id === context.state.view) ?? center[0];
    const basePath = `/sessions/${encodeURIComponent(context.sessionId)}`;
    const tabs = center.length < 2
      ? ""
      : `<nav class="views" aria-label="Views">${center
          .map((pane) => {
            const current = pane === active;
            return `<a class="view-tab${current ? " active" : ""}" href="${this.escape(context.state.href(basePath, { view: pane.id }))}"${current ? ' aria-current="true"' : ""}>${this.escape(pane.label)}</a>`;
          })
          .join("")}</nav>`;
    const css = [
      this.style.css(),
      this.header.styles(),
      this.shellStyles(),
      ...this.panes.map((pane) => pane.styles()),
      this.detail.styles(),
    ].join("\n");
    const script = [
      ...this.panes.map((pane) => pane.script(context)),
      this.detail.script(context),
    ]
      .filter((block) => block.trim().length > 0)
      .join("\n");
    const title = context.title.length > 0 ? context.title : context.sessionId;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${css}
</style>
<title>TraceVault — ${this.escape(title)}</title>
</head>
<body class="cockpit">
<div class="cockpit-shell">
${this.header.render(context)}
${top.length > 0 ? `<div class="cockpit-top">${top.map((pane) => pane.render(context)).join("\n")}</div>` : ""}
<div class="cockpit-grid">
<nav class="pane rail" aria-label="Files">${left.map((pane) => pane.render(context)).join("\n")}</nav>
<main class="pane center" aria-label="Session timeline">${tabs}${active === undefined ? "" : active.render(context)}</main>
<aside class="pane detail" aria-label="Event detail">${this.detail.render(context)}</aside>
</div>
${bottom.length > 0 ? `<div class="cockpit-bottom">${bottom.map((pane) => pane.render(context)).join("\n")}</div>` : ""}
</div>
${script.length > 0 ? `<script>\n${script}\n</script>` : ""}
</body>
</html>
`;
  }

  private shellStyles(): string {
    return `.cockpit{
  color-scheme:dark;
  --bg:#000;--panel:#1c1c1e;--panel-2:#242426;--text:#f5f5f7;--muted:#98989d;
  --line:rgba(255,255,255,.12);--accent:#0a84ff;--accent-bg:rgba(10,132,255,.16);
  --ok:#30d158;--ok-bg:rgba(48,209,88,.15);--err:#ff453a;--err-bg:rgba(255,69,58,.15);
  --warn:#ffd60a;--warn-bg:rgba(255,214,10,.15);--gap:#c7c7cc;--gap-bg:rgba(255,255,255,.08);
  --kind-hook:#0a84ff;--kind-document:#bf5af2;--kind-mcp:#40c8e0;--kind-skill:#ff9f0a;
  --kind-session:#8e8e93;--kind-gap:#ffd60a;--kind-duplicate:#8e8e93;
  --radius:18px;--shadow:0 1px 2px rgba(0,0,0,.5),0 12px 40px rgba(0,0,0,.45);
  background:var(--bg);color:var(--text);min-height:100vh;
}
.cockpit-shell{max-width:1600px;margin:0 auto;padding:20px 20px 80px}
.cockpit-grid{display:grid;grid-template-columns:230px 1fr 330px;gap:16px;align-items:start}
.cockpit .pane{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px;min-width:0}
.cockpit .rail,.cockpit .detail{position:sticky;top:16px;max-height:calc(100vh - 32px);overflow:auto}
.cockpit main.pane{max-width:none;margin:0;padding:16px}
.cockpit .center .timeline{background:transparent;box-shadow:none;border-radius:0}
.cockpit .cockpit-top{margin-bottom:16px}
.cockpit .cockpit-bottom{margin-top:16px}
.views{display:flex;gap:4px;margin:0 0 14px;border-bottom:1px solid var(--line)}
.view-tab{padding:8px 12px;color:var(--muted);font-size:13px;border-bottom:2px solid transparent;margin-bottom:-1px}
.view-tab:hover{color:var(--text);text-decoration:none}
.view-tab.active{color:var(--text);border-bottom-color:var(--accent);font-weight:600}
@media (max-width:640px){
  .cockpit-shell{padding:12px 10px 56px}
  .cockpit-grid{grid-template-columns:1fr}
  .cockpit .rail,.cockpit .detail{position:static;max-height:none;overflow:visible}
  .cockpit .rail{display:flex;align-items:baseline;gap:12px;padding:12px 14px}
  .cockpit .rail .pane-empty{margin:0}
}`;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
