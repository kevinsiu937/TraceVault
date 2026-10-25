import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface ManifestJson {
  targetFile: string;
  existed: boolean;
  previousContent: string | null;
}

export class InstallManifest {
  private targetFile = "";
  private wasPresent = false;
  private previous: string | null = null;

  constructor(targetFile?: string, existed?: boolean, previousContent?: string | null) {
    if (targetFile !== undefined) {
      this.targetFile = targetFile;
    }
    if (existed !== undefined) {
      this.wasPresent = existed;
    }
    if (previousContent !== undefined) {
      this.previous = previousContent;
    }
  }

  get target(): string {
    return this.targetFile;
  }

  get existed(): boolean {
    return this.wasPresent;
  }

  get previousContent(): string | null {
    return this.previous;
  }

  save(path: string): void {
    const data: ManifestJson = {
      targetFile: this.targetFile,
      existed: this.wasPresent,
      previousContent: this.previous,
    };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  load(path: string): void {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<ManifestJson>;
    const previous = parsed.previousContent;

    if (
      typeof parsed.targetFile !== "string" ||
      typeof parsed.existed !== "boolean" ||
      (previous !== null && typeof previous !== "string") ||
      (parsed.existed && previous === null)
    ) {
      throw new TypeError(`invalid install manifest: ${path}`);
    }

    this.targetFile = parsed.targetFile;
    this.wasPresent = parsed.existed;
    this.previous = previous;
  }

  delete(path: string): void {
    rmSync(path, { force: true });
  }
}
