/** Four-digit years only: an extended year would break the text ordering the store relies on. */
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;

/**
 * An inclusive wall-clock range. Bounds are held as canonical ISO-8601 UTC
 * strings, the same shape the store writes, so SQL can compare them as text.
 * A range that cannot be read is no range at all: parse() returns null instead
 * of a half-valid window.
 */
export class TimeWindow {
  private constructor(
    readonly from: string,
    readonly to: string,
  ) {}

  static parse(from: string | null, to: string | null): TimeWindow | null {
    const start = TimeWindow.instant(from);
    const end = TimeWindow.instant(to);
    if (start === null || end === null) {
      return null;
    }
    const [low, high] = start <= end ? [start, end] : [end, start];
    return new TimeWindow(new Date(low).toISOString(), new Date(high).toISOString());
  }

  get fromMs(): number {
    return Date.parse(this.from);
  }

  get toMs(): number {
    return Date.parse(this.to);
  }

  private static instant(value: string | null): number | null {
    if (value === null || !UTC_ISO.test(value.trim())) {
      return null;
    }
    const parsed = Date.parse(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
}
