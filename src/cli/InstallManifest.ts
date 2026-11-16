import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AgentConfigFile } from "./AgentConfigFile.js";

interface ManifestJson {
  targetFile: string;
  existed: boolean;
  previousContent: string | null;
}

/**
 * One reversible change to one file, recorded at `path`. Applying keeps the
 * earliest original, so a second run cannot make undo restore TraceVault's
 * own bytes; undo puts that original back byte for byte, or deletes a file
 * that did not exist. The record's format is the one earlier versions wrote.
 */
export class InstallManifest {
  constructor(private readonly path: string) {}

  /** True while a change is recorded, in other words while there is something to undo. */
  applied(): boolean {
    return existsSync(this.path);
  }

  apply(target: string, content: string): void {
    const file = new AgentConfigFile(target);
    if (!this.applied()) {
      const existed = file.exists();
      const data: ManifestJson = { targetFile: target, existed, previousContent: existed ? file.read() : null };
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    }
    file.write(content);
  }

  /** Puts the recorded original back and forgets the change; says whether the file existed before. */
  undo(): boolean {
    const record = this.load();
    const file = new AgentConfigFile(record.targetFile);
    if (record.existed && record.previousContent !== null) {
      file.write(record.previousContent);
    } else {
      file.delete();
    }
    rmSync(this.path, { force: true });
    return record.existed;
  }

  private load(): ManifestJson {
    const parsed = JSON.parse(readFileSync(this.path, "utf8")) as Partial<ManifestJson>;
    const previous = parsed.previousContent;

    if (
      typeof parsed.targetFile !== "string" ||
      typeof parsed.existed !== "boolean" ||
      (previous !== null && typeof previous !== "string") ||
      (parsed.existed && previous === null)
    ) {
      throw new TypeError(`invalid install manifest: ${this.path}`);
    }

    return { targetFile: parsed.targetFile, existed: parsed.existed, previousContent: previous };
  }
}
