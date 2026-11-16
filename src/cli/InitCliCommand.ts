import type { CliCommand } from "./CliCommand.js";
import { CommandOptions } from "./CommandOptions.js";
import { HardenCommand } from "./HardenCommand.js";
import { InitCommand } from "./InitCommand.js";

/** `tracevault init`: attaches TraceVault to a project and, unless told not to, hardens it. */
export class InitCliCommand implements CliCommand {
  readonly name = "init";
  readonly usageOnError = true;
  readonly usage = `  tracevault init [--dir <path>] [--block] [--no-harden] [--port <n>]
                                          attach TraceVault to a project and make its
                                          opencode.json ask before risky calls;
                                          --block refuses calls a blockable rule matches;
                                          --no-harden leaves opencode.json alone;
                                          --port is the port the service runs on, if not 4319`;

  async run(args: readonly string[]): Promise<number> {
    const flags = CommandOptions.parse(args, { "--dir": "directory", "--block": "switch", "--no-harden": "switch", "--port": "port" });
    const directory = flags["--dir"] ?? process.cwd();
    const hardener = flags["--no-harden"] === undefined ? new HardenCommand(directory) : null;
    const port = flags["--port"] === undefined ? undefined : Number(flags["--port"]);
    process.stdout.write(`${new InitCommand(directory, flags["--block"] !== undefined, hardener, port).install()}\n`);
    return 0;
  }
}
