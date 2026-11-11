const SECRET_KEY = /key|token|secret|password|auth|credential/i;
const SECRET_MAPS: ReadonlySet<string> = new Set(["headers", "environment", "env"]);
const REDACTED = "[redacted]";

/**
 * A copy of OpenCode's resolved configuration that is safe to store. OpenCode
 * substitutes {env:...} and {file:...} references before plugins see the
 * configuration (probed 11 Nov 2026), so every value under a secret-looking key
 * is treated as a real secret: its strings are replaced, its shape is kept.
 */
export class ConfigRedactor {
  redact(config: unknown): Record<string, unknown> {
    if (config === null || typeof config !== "object" || Array.isArray(config)) {
      throw new TypeError("the configuration is not an object");
    }
    // Plain data only: functions drop out, and a cycle throws here rather than later.
    const plain = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
    return this.walk(plain, false) as Record<string, unknown>;
  }

  private walk(value: unknown, secret: boolean): unknown {
    if (typeof value === "string") {
      return secret && value.length > 0 ? REDACTED : value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.walk(item, secret));
    }
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, inner]) => [key, this.walk(inner, secret || SECRET_KEY.test(key) || SECRET_MAPS.has(key))]),
      );
    }
    return value;
  }
}
