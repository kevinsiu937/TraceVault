import { existsSync, writeFileSync } from "node:fs";
import { ReportView } from "../dashboard/ReportView.js";
import { ServiceAssembly } from "./ServiceAssembly.js";

/** Writes one session's report to a new file. It never creates a database or overwrites a file. */
export class ReportCommand {
  constructor(private readonly view: ReportView = new ReportView()) {}

  run(sessionId: string, dbPath: string, out: string): string {
    if (!existsSync(dbPath)) {
      throw new Error(`no database at ${dbPath}`);
    }
    if (existsSync(out)) {
      throw new Error(`${out} already exists; choose another --out`);
    }
    const { service, store } = new ServiceAssembly().open(dbPath);
    try {
      if (!service.hasSession(sessionId)) {
        throw new Error(`no session '${sessionId}' in ${dbPath}`);
      }
      writeFileSync(out, this.view.render(service, sessionId), { encoding: "utf8", flag: "wx" });
      return `report for ${sessionId} written to ${out}`;
    } finally {
      store.close();
    }
  }
}
