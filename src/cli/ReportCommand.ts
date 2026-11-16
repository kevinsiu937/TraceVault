import { existsSync, writeFileSync } from "node:fs";
import { ReportView } from "../dashboard/ReportView.js";
import type { RuleChoice } from "../service/RuleHistoryPort.js";
import type { CliCommand } from "./CliCommand.js";
import { CommandOptions } from "./CommandOptions.js";
import { ServiceAssembly } from "./ServiceAssembly.js";

/** `tracevault report`: writes one session's report to a new file. It never creates a database or overwrites a file. */
export class ReportCommand implements CliCommand {
  readonly name = "report";
  readonly usageOnError = true;
  readonly usage = `  tracevault report <session-id> [--db <path>] --out <file> [--rules now|then]
                                          write one session as a self-contained HTML report,
                                          under today's rules or those from when it was recorded`;

  constructor(
    private readonly defaultDbPath: string,
    private readonly view: ReportView = new ReportView(),
  ) {}

  async run(args: readonly string[]): Promise<number> {
    const sessionId = args[0];
    if (sessionId === undefined || sessionId.startsWith("-")) {
      throw new TypeError("report expects a session id");
    }
    const flags = CommandOptions.parse(args.slice(1), { "--db": "file", "--out": "file", "--rules": "rules" });
    const out = flags["--out"];
    if (out === undefined) {
      throw new TypeError("report expects --out <file>");
    }
    const rules = flags["--rules"] === "then" ? "then" : "now";
    process.stdout.write(`${this.write(sessionId, flags["--db"] ?? this.defaultDbPath, out, rules)}\n`);
    return 0;
  }

  private write(sessionId: string, dbPath: string, out: string, rules: RuleChoice): string {
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
      writeFileSync(out, this.view.render(service, sessionId, rules), { encoding: "utf8", flag: "wx" });
      return `report for ${sessionId} written to ${out}`;
    } finally {
      store.close();
    }
  }
}
