// Ticket 96: TraceVault packed, installed from the tarball, and run from there, never from this clone.
// Run with `node tests/package/install-smoke.mjs`; `npm pack` builds first. Needs npm's registry or cache for the dependencies.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TIMEOUT_MS = 15000;
const clone = fileURLToPath(new URL("../../", import.meta.url));
const temp = realpathSync(mkdtempSync(join(tmpdir(), "tracevault-pack-")));
const prefix = join(temp, "prefix");
const project = join(temp, "project");
const db = join(temp, "events.db");
mkdirSync(project);
// The installed CLI keeps its state, and looks for OpenCode's history, only inside the temporary folder.
const env = { ...process.env, LOCALAPPDATA: join(temp, "state"), TRACEVAULT_OPENCODE_DB: join(temp, "no-opencode.db") };
process.env.LOCALAPPDATA = env.LOCALAPPDATA;

const npm = (args) => execFileSync("npm", args, { cwd: clone, encoding: "utf8", shell: process.platform === "win32" });
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer().once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

let service = null;
try {
  const [{ filename }] = JSON.parse(npm(["pack", "--json", "--pack-destination", temp]));
  npm(["install", "-g", "--prefer-offline", "--no-audit", "--no-fund", "--prefix", prefix, join(temp, filename)]);
  const installed = join(prefix, process.platform === "win32" ? "" : "lib", "node_modules", "tracevault");
  const bin = join(prefix, process.platform === "win32" ? "tracevault.cmd" : join("bin", "tracevault"));
  const tracevault = (args) => execFileSync(bin, args, { env, encoding: "utf8", shell: process.platform === "win32" });

  assert.equal(tracevault(["--version"]).trim(), JSON.parse(readFileSync(join(clone, "package.json"), "utf8")).version);
  console.log("ok - the installed tracevault prints its version");

  const port = await freePort();
  tracevault(["init", "--dir", project, "--no-harden", "--port", String(port)]);
  const loaderPath = join(project, ".opencode", "plugin", "tracevault.js");
  const loader = readFileSync(loaderPath, "utf8");
  assert.ok(loader.includes(pathToFileURL(join(installed, "dist", "plugin")).href), "the loader imports the installed plugin");
  assert.ok(!loader.includes(pathToFileURL(clone).href) && !loader.includes(JSON.stringify(clone).slice(1, -1)), "the loader does not point into the clone");
  const { TraceVault } = await import(pathToFileURL(loaderPath).href);
  assert.equal(typeof (await TraceVault())["tool.execute.after"], "function", "the loader loads the installed plugin");
  console.log("ok - init wrote a loader that loads the installed plugin");

  service = spawn(bin, ["run", "--port", String(port), "--db", db], { env, shell: process.platform === "win32" });
  await new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`run did not start: ${out}`)), TIMEOUT_MS);
    service.stdout.on("data", (chunk) => {
      out += chunk;
      if (out.includes("listening on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    service.stderr.on("data", (chunk) => (out += chunk));
    service.once("exit", (code) => reject(new Error(`run exited with ${code}: ${out}`)));
  });
  const response = await fetch(`http://127.0.0.1:${port}/hook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hook: "session.created", sessionID: "ses_package_smoke", title: "package smoke" }),
  });
  assert.ok(response.ok, `the installed service took the hook payload (${response.status})`);
  await new Promise((resolve) => {
    service.once("exit", resolve);
    service.kill();
  });
  service = null;
  console.log("ok - the installed run took a hook payload");

  assert.match(tracevault(["verify", "--db", db]), /the record is intact: [1-9]\d* events?/);
  console.log("ok - verify passes on the installed service's database");
} finally {
  service?.kill();
  rmSync(temp, { recursive: true, force: true });
}
