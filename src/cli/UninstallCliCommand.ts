import type { CliCommand } from "./CliCommand.js";
import { CommandOptions } from "./CommandOptions.js";
import { HardenCommand } from "./HardenCommand.js";
import { UninstallCommand } from "./UninstallCommand.js";

/** `tracevault uninstall`: removes TraceVault and puts back what init and harden changed. */
export class UninstallCliCommand implements CliCommand {
  readonly name = "uninstall";
  readonly usageOnError = true;
  readonly usage = `  tracevault uninstall [--dir <path>]     remove TraceVault and restore the configuration,
                                          including what init or harden changed`;

  async run(args: readonly string[]): Promise<number> {
    const directory = CommandOptions.parse(args, { "--dir": "directory" })["--dir"] ?? process.cwd();
    process.stdout.write(`${new UninstallCommand(directory, new HardenCommand(directory)).uninstall()}\n`);
    return 0;
  }
}
