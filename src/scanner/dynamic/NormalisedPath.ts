/**
 * A file path in the one shape rules compare: forward slashes, no repeated
 * slashes, lower case. The Phase 1 probes ran on Windows, where
 * `C:\Work\opencode.json` and `c:/work/opencode.json` are the same file.
 */
export class NormalisedPath {
  private constructor(readonly value: string) {}

  static of(raw: string): NormalisedPath {
    return new NormalisedPath(raw.replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase());
  }
}
