/** A rule file that cannot become a rule. The message names the file and the field. */
export class RuleLoadError extends Error {
  constructor(file: string, field: string, problem: string) {
    super(`${file}: ${field}: ${problem}`);
    this.name = "RuleLoadError";
  }
}
