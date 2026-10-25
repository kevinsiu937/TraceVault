export class PluginConfig {
  private readonly endpoint: string;

  constructor(endpoint: string) {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new TypeError(`unsupported endpoint protocol: ${parsed.protocol}`);
    }
    this.endpoint = parsed.toString();
  }

  get hookUrl(): string {
    return this.endpoint;
  }
}
