import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_CHARS = 10;
const RANDOM_CHARS = 16;

export class EventId {
  private constructor(private readonly value: string) {}

  static create(now: Date = new Date()): EventId {
    let remaining = BigInt(now.getTime());
    let timestamp = "";
    for (let index = 0; index < TIME_CHARS; index += 1) {
      timestamp = CROCKFORD.charAt(Number(remaining & 31n)) + timestamp;
      remaining >>= 5n;
    }

    const random = randomBytes(RANDOM_CHARS);
    let suffix = "";
    for (const byte of random) {
      suffix += CROCKFORD.charAt(byte & 31);
    }

    return new EventId(`evt_${timestamp}${suffix}`);
  }

  toString(): string {
    return this.value;
  }
}
