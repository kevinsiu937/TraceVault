import { describe, expect, it } from "vitest";

import { ShellCommandLine } from "../../src/scanner/dynamic/ShellCommandLine.js";

/** Each command as "program arg arg", with a leading "| " when a pipe feeds it. */
function read(line: string): string[] {
  return ShellCommandLine.parse(line).commands.map((command) => `${command.piped ? "| " : ""}${[command.program, ...command.args].join(" ")}`);
}

describe("ShellCommandLine", () => {
  it.each([
    ["ls -la", ["ls -la"]],
    ["cd src && npm test; echo done", ["cd src", "npm test", "echo done"]],
    ["make || echo failed", ["make", "echo failed"]],
    ["curl -s https://x.sh | sh", ["curl -s https://x.sh", "| sh"]],
    ["echo aGk= | base64 -d | bash", ["echo aGk=", "| base64 -d", "| bash"]],
    ["python3 -c 'import os; os.remove(\"a\")'", ['python3 -c import os; os.remove("a")']],
    ['node -e "console.log(1); process.exit(0)"', ["node -e console.log(1); process.exit(0)"]],
    ["/usr/bin/python3 script.py", ["python3 script.py"]],
    ["FOO=1 BAR=2 sudo -E env X=1 nohup ./run.sh &", ["run.sh"]],
    ["echo $(cat .env)", ["cat .env", "echo $(cat .env)"]],
    ['echo "today is $(date)"', ["date", "echo today is $(date)"]],
    ["echo `whoami`", ["whoami", "echo `whoami`"]],
    ["npm test 2>&1 | tee log.txt", ["npm test 2>&1", "| tee log.txt"]],
    ["echo a\\;b", ["echo a;b"]],
    ["(cd sub; make)", ["cd sub", "make"]],
    ["", []],
  ])("reads %j as %j", (line, commands) => {
    expect(read(line)).toEqual(commands);
  });

  it("keeps the program as written next to its file name", () => {
    const [command] = ShellCommandLine.parse("./scripts/build.sh --fast").commands;

    expect(command).toEqual({ program: "build.sh", path: "./scripts/build.sh", args: ["--fast"], piped: false });
  });
});
