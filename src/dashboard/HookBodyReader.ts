import type { IncomingMessage } from "node:http";

const MAX_BODY_BYTES = 1024 * 1024;

export class HookBodyReader {
  read(request: IncomingMessage): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;

      request.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total <= MAX_BODY_BYTES) {
          chunks.push(chunk);
        }
      });
      request.on("end", () => {
        resolve(total > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString("utf8"));
      });
      request.on("error", reject);
    });
  }
}
