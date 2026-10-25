export class CanonicalJson {
  serialize(value: unknown): string {
    return JSON.stringify(this.normalize(value));
  }

  private normalize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalize(item));
    }

    if (value !== null && typeof value === "object") {
      const source = value as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(source).sort()) {
        const item = source[key];
        if (item !== undefined) {
          sorted[key] = this.normalize(item);
        }
      }
      return sorted;
    }

    return value;
  }
}
