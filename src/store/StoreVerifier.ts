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

    for (const row of this.store.listAllOrdered()) {
      const sessionId = row.event.session_id;
      const position = positions.get(sessionId) ?? 0;
      positions.set(sessionId, position + 1);

      if (row.event.prev_hash !== prevHash) {
        return { ok: false, sessionId, position, rowId: row.rowId, reason: "broken-link" };
      }

      if (this.chain.compute(prevHash, row.event) !== row.hash) {
        return { ok: false, sessionId, position, rowId: row.rowId, reason: "hash-mismatch" };
      }

      prevHash = row.hash;
    }

    return { ok: true };
  }
}
