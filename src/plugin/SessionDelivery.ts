import type { EventForwarderPort } from "./EventForwarderPort.js";
import type { Outbox } from "./Outbox.js";
import type { PendingGapStore } from "./PendingGapStore.js";
import type { SessionPreamble } from "./SessionPreamble.js";

/**
 * Forwards one session's payloads: the session's preamble first, then the
 * payload, each stamped with the time it was observed. A payload that cannot
 * be forwarded waits in the outbox, and while the outbox holds anything new
 * payloads queue behind it. Without an outbox, or when it cannot be written, a
 * failed forward becomes a pending gap, reported once forwarding works again.
 * A failure never reaches the agent.
 */
export class SessionDelivery {
  private draining = false;

  constructor(
    private readonly forwarder: EventForwarderPort,
    private readonly gaps: PendingGapStore,
    private readonly preamble: SessionPreamble,
    private readonly outbox: Outbox | null = null,
  ) {}

  async send(payload: unknown, sessionID: string): Promise<void> {
    const first = this.preamble.for(sessionID);
    const observedAt = new Date().toISOString();
    const queue = [...first.payloads, payload].map((item) => (typeof item === "object" && item !== null ? { ...item, observedAt } : item));

    if (this.outbox?.holds() === true) {
      if (this.keep(queue, sessionID)) {
        first.delivered();
      }
      if (await this.drain()) {
        await this.flushGaps();
      }
      return;
    }

    let sent = 0;
    try {
      for (const item of queue) {
        if (sent === first.payloads.length) {
          first.delivered();
        }
        await this.forwarder.forward(item);
        sent += 1;
      }
    } catch {
      // Capture is best-effort: a failed forward must never break the agent's tool call.
      if (this.keep(queue.slice(sent), sessionID) && sent < first.payloads.length) {
        first.delivered();
      }
      return;
    }

    if (await this.drain()) {
      await this.flushGaps();
    }
  }

  /** Puts what could not be sent in the outbox; false when it went to the gap state instead. */
  private keep(items: readonly unknown[], sessionID: string): boolean {
    try {
      if (this.outbox === null) {
        throw new Error("no outbox");
      }
      for (const item of items) {
        const dropped = this.outbox.append(sessionID, item as object);
        if (dropped !== null) {
          const gap = { hook: "capture.gap", ...dropped, reason: "outbox full", observedAt: new Date().toISOString() };
          this.outbox.append(dropped.sessionID, gap);
        }
      }
      return true;
    } catch {
      this.gaps.record(sessionID, new Date());
      return false;
    }
  }

  /** True when nothing is left waiting. One drain at a time: a payload kept meanwhile is picked up by the running one. */
  private async drain(): Promise<boolean> {
    if (this.outbox === null || this.draining) {
      return this.outbox === null;
    }
    this.draining = true;
    try {
      return await this.outbox.drain((payload) => this.forwarder.forward(payload));
    } finally {
      this.draining = false;
    }
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
