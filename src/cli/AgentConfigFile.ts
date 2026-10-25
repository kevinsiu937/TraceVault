import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class AgentConfigFile {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  exists(): boolean {
    return existsSync(this.path);
  }

  read(): string {
    return readFileSync(this.path, "utf8");
  }

  write(content: string): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, content, "utf8");
  }

  delete(): void {
    rmSync(this.path, { force: true });
  }
}
