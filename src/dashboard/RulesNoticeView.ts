import type { SessionPaneView } from "./SessionPaneView.js";
import type { SessionRenderContext } from "./SessionRenderContext.js";

/**
 * One plain line above the findings, when the rules matter: the rules from
 * when the session was recorded disagree with today's, or were not kept.
 * Nothing renders when both agree.
 */
export class RulesNoticeView implements SessionPaneView {
  readonly id = "rules-notice";
  readonly label = "Rules";
  readonly slot = "top" as const;

  render(context: SessionRenderContext): string {
    const session = `/sessions/${encodeURIComponent(context.sessionId)}`;
    const { viewing, versions } = context.rules;
    if (viewing === "then" && versions !== "unknown") {
      return this.line(`These findings use the rules from when this session was recorded. <a href="${session}">Use today's rules</a>`);
    }
    if (versions === "different") {
      return this.line(`These findings use today's rules. The rules from when this session was recorded give a different result. <a href="${session}?rules=then">See that result</a>`);
    }
    if (versions === "unknown") {
      return this.line("The rules from when this session was recorded were not kept, so these findings use today's rules.");
    }
    return "";
  }

  styles(): string {
    return ".rules-notice{margin:0 0 12px;padding:8px 14px;border:1px solid var(--line);border-radius:8px;font-size:13px;color:var(--muted)}.rules-notice a{color:var(--accent)}";
  }

  script(_context: SessionRenderContext): string {
    return "";
  }

  private line(html: string): string {
    return `<p class="rules-notice" role="note">${html}</p>`;
  }
}
