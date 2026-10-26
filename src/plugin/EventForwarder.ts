import type { EventForwarderPort } from "./EventForwarderPort.js";
import type { PluginConfig } from "./PluginConfig.js";

const TIMEOUT_MS = 2000;

export class EventForwarder implements EventForwarderPort {
  private readonly config: PluginConfig;

  constructor(config: PluginConfig) {
    this.config = config;
  }

  async forward(payload: unknown): Promise<void> {
    const response = await fetch(this.config.hookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`capture endpoint returned ${response.status}`);
    }
  }
}
