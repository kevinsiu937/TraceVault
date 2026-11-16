/** One `tracevault <name>` command: its lines of the help text, the flags it reads, and what it does. */
export interface CliCommand {
  readonly name: string;
  /** Its lines of the usage text, indented as they print. */
  readonly usage: string;
  /** Whether a refused command line also prints the whole usage text. */
  readonly usageOnError: boolean;
  /** Runs with the arguments after the name and resolves to the exit code. The entry point prints what it throws. */
  run(args: readonly string[]): Promise<number>;
}
