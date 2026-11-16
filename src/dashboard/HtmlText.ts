const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Text that is safe inside a page or an attribute. The only way to make one is to escape a string. */
export class HtmlText {
  private constructor(private readonly html: string) {}

  static escape(value: string): HtmlText {
    return new HtmlText(value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character));
  }

  toString(): string {
    return this.html;
  }
}
