import type { EventStorePort } from "./EventStorePort.js";
import { CanonicalJson } from "./CanonicalJson.js";
import { HashChain } from "./HashChain.js";

export type StoreVerificationResult =
  | { ok: true }
  | {
      ok: false;
      sessionId: string;
      position: number;
      rowId: number;
      reason: "hash-mismatch" | "broken-link";
    };

export class StoreVerifier {
  private readonly chain: HashChain;

  constructor(
    private readonly store: EventStorePort,
    chain: HashChain = new HashChain(new CanonicalJson()),
  ) {
    this.chain = chain;
  }

  verify(): StoreVerificationResult {
    let prevHash = this.chain.genesis;
    const positions = new Map<string, number>();
    const anchors = this.store.listAnchors();

    for (const row of this.store.listAllOrdered()) {
      const sessionId = row.event.session_id;
      const position = positions.get(sessionId) ?? 0;
      positions.set(sessionId, position + 1);

      // Rows moved to an archive left anchors: follow them, never more than there are, to where this row's link points.
      for (let step = 0; row.stored.prev_hash !== prevHash && anchors.has(prevHash) && step < anchors.size; step += 1) {
        prevHash = anchors.get(prevHash) ?? prevHash;
      }
      if (row.stored.prev_hash !== prevHash) {
        return { ok: false, sessionId, position, rowId: row.rowId, reason: "broken-link" };
      }

      if (this.chain.compute(prevHash, row.stored) !== row.hash) {
        return { ok: false, sessionId, position, rowId: row.rowId, reason: "hash-mismatch" };
      }

      prevHash = row.hash;
    }

    return { ok: true };
  }
}
