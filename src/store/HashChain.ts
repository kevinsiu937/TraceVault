import { createHash } from "node:crypto";

import type { Event } from "../schema/Event.js";
import type { CanonicalJson } from "./CanonicalJson.js";

export class HashChain {
  readonly genesis: string;

  constructor(
    private readonly canonical: CanonicalJson,
    genesis: string = "0".repeat(64),
  ) {
    this.genesis = genesis;
  }

  compute(prevHash: string, event: Event): string {
    const digest = createHash("sha256").update(prevHash + this.canonical.serialize(event)).digest("hex");
    return `sha256:${digest}`;
  }
}
