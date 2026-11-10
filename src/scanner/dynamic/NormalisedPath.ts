/**
 * A file path in the one shape rules compare: forward slashes, no repeated
 * slashes, no `.` or `..` segments, lower case. The Phase 1 probes ran on
 * Windows, where `C:\Work\opencode.json` and `c:/work/opencode.json` are the
 * same file. `..` is folded away so `/proj/../etc/x` is compared as `/etc/x`.
 */
export class NormalisedPath {
  private constructor(readonly value: string) {}

  static of(raw: string): NormalisedPath {
    return new NormalisedPath(NormalisedPath.resolve(raw.replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase()));
  }

  /** A `..` above an absolute root stays at the root; one above a relative path is kept. */
  private static resolve(path: string): string {
    const segments = path.split("/");
    const head = segments[0] ?? "";
    const root = head === "" || /^[a-z]:$/.test(head) ? segments.shift() : undefined;
    const kept: string[] = [];
    for (const segment of segments) {
      if (segment === ".") {
        continue;
      }
      if (segment === ".." && kept.length > 0 && kept[kept.length - 1] !== "..") {
        kept.pop();
      } else if (segment !== ".." || root === undefined) {
        kept.push(segment);
      }
    }
    return root === undefined ? kept.join("/") : [root, ...kept].join("/");
  }
}
