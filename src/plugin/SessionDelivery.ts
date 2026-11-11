import type { EventForwarderPort } from "./EventForwarderPort.js";
import type { PendingGapStore } from "./PendingGapStore.js";
import type { SessionPreamble } from "./SessionPreamble.js";

/**
 * Forwards one session's payloads: the session's preamble first, then the
 * payload. A failed forward never reaches the agent; it becomes a pending gap,
 * reported once forwarding works again.
 */
export class SessionDelivery {
  constructor(
    private readonly forwarder: EventForwarderPort,
    private readonly gaps: PendingGapStore,
    private readonly preamble: SessionPreamble,
  ) {}

  async send(payload: unknown, sessionID: string): Promise<void> {
    try {
      const first = this.preamble.for(sessionID);
      for (const preamble of first.payloads) {
        await this.forwarder.forward(preamble);
      }
      first.delivered();
      await this.forwarder.forward(payload);
    } catch {
      // Capture is best-effort: a failed forward must never break the agent's tool call.
      this.gaps.record(sessionID, new Date());
      return;
    }

    await this.flushGaps();
  }

  private async flushGaps(): Promise<void> {
    const gaps = this.gaps.load();
    const flushed: string[] = [];

    for (const gap of gaps) {
      try {
        await this.forwarder.forward({
          hook: "capture.gap",
          sessionID: gap.sessionID,
          from: gap.from,
          to: gap.lastFailureAt,
          reason: "capture endpoint unavailable",
        });
        flushed.push(gap.sessionID);
      } catch {
        // Keep this gap and the rest for the next successful forward.
        break;
      }
    }

    if (flushed.length > 0) {
      this.gaps.remove(flushed);
    }
  }
}
