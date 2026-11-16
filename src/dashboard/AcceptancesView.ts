import type { ConfigurationSnapshot } from "../service/ConfigurationSnapshot.js";
import { HtmlText } from "./HtmlText.js";
import { PlainWords } from "./PlainWords.js";

/** Each time the developer accepted a server's changed tools, so an acceptance nobody made can be seen. Nothing when none was made. */
export class AcceptancesView {
  constructor(private readonly words: PlainWords = new PlainWords()) {}

  render(acceptances: ConfigurationSnapshot["acceptances"]): string {
    if (acceptances.length === 0) {
      return "";
    }
    const items = acceptances
      .map(({ server, acceptedAt }) => `<li class="mcp-acceptance"><code>${HtmlText.escape(server)}</code>: accepted <time datetime="${HtmlText.escape(acceptedAt)}">${HtmlText.escape(this.words.dateTime(acceptedAt))}</time></li>`)
      .join("");
    return `<p>Add-on tool changes accepted with <code>tracevault trust</code>; later changes are compared with the accepted tools:</p><ul class="mcp-acceptances">${items}</ul>`;
  }
}
