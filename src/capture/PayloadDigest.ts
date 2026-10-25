import { createHash } from "node:crypto";

export class PayloadDigest {
  describe(value: unknown): { digest: string; sizeBytes: number } {
    const text = JSON.stringify(value) ?? "";
    return {
      digest: `sha256:${createHash("sha256").update(text).digest("hex")}`,
      sizeBytes: Buffer.byteLength(text, "utf8"),
    };
  }
}
