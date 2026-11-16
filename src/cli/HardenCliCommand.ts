import type { CliCommand } from "./CliCommand.js";
import { CommandOptions } from "./CommandOptions.js";
import { HardenCommand } from "./HardenCommand.js";

/** `tracevault harden`: tightens the project's opencode.json, or with --undo puts the original back. */
export class HardenCliCommand implements CliCommand {
  readonly name = "harden";
  readonly usageOnError = false;
  readonly usage = `  tracevault harden [--dir <path>] [--undo]   make the project's opencode.json ask before
                                          risky calls; --undo puts the original back`;

  async run(args: readonly string[]): Promise<number> {
    const flags = CommandOptions.parse(args, { "--dir": "directory", "--undo": "switch" });
    const command = new HardenCommand(flags["--dir"] ?? process.cwd());
    process.stdout.write(`${flags["--undo"] === undefined ? command.harden() : command.undo()}\n`);
    return 0;
  }
}
