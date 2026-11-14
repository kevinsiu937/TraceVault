import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RuleHistoryPort, RuleSetScanners } from "../service/RuleHistoryPort.js";
import type { RuleFiles, SqliteRuleSetStore } from "../store/SqliteRuleSetStore.js";

/** The folders a rule set is made of, relative to the rules directory. */
const FOLDERS = ["", "lists", "config"];

/**
 * Keeps every rule set the service runs with, in the events database, and
 * rebuilds the scanners of an older one from its stored files when a session
 * recorded under it is viewed "then".
 */
export class StoredRuleHistory implements RuleHistoryPort {
  private readonly built = new Map<string, RuleSetScanners | null>();

  constructor(
    private readonly store: SqliteRuleSetStore,
    private readonly digest: string,
    files: RuleFiles,
    /** Builds both scanners from a rules directory, the way the service's own are built. */
    private readonly scannersFrom: (directory: string) => RuleSetScanners,
  ) {
    store.save(digest, files);
  }

  /** Every rule and list file in a rules directory, and one digest over all of them. */
  static read(rulesDir: string): { readonly digest: string; readonly files: RuleFiles } {
    const files: Record<string, string> = {};
    for (const folder of FOLDERS) {
      const directory = join(rulesDir, folder);
      if (!existsSync(directory)) {
        continue;
      }
      for (const name of readdirSync(directory).filter((file) => file.endsWith(".yaml")).sort()) {
        files[folder === "" ? name : `${folder}/${name}`] = readFileSync(join(directory, name), "utf8");
      }
    }
    const digest = createHash("sha256").update(JSON.stringify(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)))).digest("hex");
    return { digest: `sha256:${digest}`, files };
  }

  recordSession(sessionId: string): void {
    this.store.recordSession(sessionId, this.digest);
  }

  then(sessionId: string): RuleSetScanners | "current" | null {
    const digest = this.store.sessionDigest(sessionId);
    if (digest === null) {
      return null;
    }
    if (digest === this.digest) {
      return "current";
    }
    if (!this.built.has(digest)) {
      this.built.set(digest, this.rebuild(digest));
    }
    return this.built.get(digest) ?? null;
  }

  private rebuild(digest: string): RuleSetScanners | null {
    const files = this.store.load(digest);
    if (files === null) {
      return null;
    }
    const directory = mkdtempSync(join(tmpdir(), "tracevault-rules-then-"));
    try {
      for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(directory, path)), { recursive: true });
        writeFileSync(join(directory, path), content, "utf8");
      }
      return this.scannersFrom(directory);
    } catch {
      // shortcut: a stored rule set this version can no longer load counts as not kept; say why if it ever happens in practice.
      return null;
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}
