type Item = { readonly value: string; readonly entry: string };

/**
 * Every piece of text a tool shows the model: its description, and each
 * description inside its input schema, with a JSON pointer to where it sits.
 * The model reads all of it whether or not it ever calls the tool.
 */
export class ToolTexts {
  static of(tool: Readonly<Record<string, unknown>>): Item[] {
    const texts: Item[] = typeof tool["description"] === "string" ? [{ value: tool["description"], entry: "/description" }] : [];
    const walk = (value: unknown, pointer: string): void => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${pointer}/${index}`));
      } else if (value !== null && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) {
          const at = `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
          if (key === "description" && typeof inner === "string") {
            texts.push({ value: inner, entry: at });
          } else {
            walk(inner, at);
          }
        }
      }
    };
    walk(tool["inputSchema"], "/inputSchema");
    return texts;
  }
}
