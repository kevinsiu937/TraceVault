import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HookPayloadParser } from "../../src/capture/HookPayloadParser.js";
import { PayloadDigest } from "../../src/capture/PayloadDigest.js";
import { PluginHookCapture } from "../../src/capture/PluginHookCapture.js";
import { ToolClassifier } from "../../src/capture/ToolClassifier.js";
import { main } from "../../src/cli/index.js";
import { ServiceAssembly } from "../../src/cli/ServiceAssembly.js";
import { ActivityView } from "../../src/dashboard/ActivityView.js";
import { DashboardServer } from "../../src/dashboard/DashboardServer.js";
import { SessionListView } from "../../src/dashboard/SessionListView.js";
import { TimelineView } from "../../src/dashboard/TimelineView.js";
import type { Event } from "../../src/schema/Event.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

const FIXTURES = join(import.meta.dirname, "../fixtures");

function events(path: string): readonly Event[] {
  return (JSON.parse(readFileSync(join(FIXTURES, path), "utf8")) as { events: readonly Event[] }).events;
}

const TRIGGER = events("rules/phase-2-exit/trigger.json");
const SESSION = TRIGGER[0]?.session_id ?? "";
const CLEAN = events("rules/phase-2-exit/clean.json");
const MISCONFIGURED = events("phase-3-exit/misconfigured.json");
const WELL_CONFIGURED = events("phase-3-exit/clean.json");
// tool-changed needs an earlier session's tool list, which the one recorded run cannot have; tool-trust.seam proves it.
const CONFIG_RULES = readdirSync(join(import.meta.dirname, "../../rules/config"))
  .map((file) => file.replace(/\.yaml$/, ""))
  .filter((id) => id !== "tool-changed")
  .sort();
// Recorded 10 Nov 2026 (refusal-probe.sh run 2): the call the guard refused.
const REFUSED = (JSON.parse(readFileSync(join(FIXTURES, "tool-refused-by-hook.json"), "utf8")) as {
  "tool.execute.before": { input: { sessionID: string; callID: string; tool: string }; output: { args: Record<string, unknown> } };
})["tool.execute.before"];

describe("seam A: a session in, one self-contained report file out", () => {
  let directory: string;
  let db: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-report-"));
    db = join(directory, "events.db");
    const store = new SqliteEventStore(db);
    for (const event of [...TRIGGER, ...CLEAN, ...MISCONFIGURED, ...WELL_CONFIGURED]) {
      store.append(event);
    }
    store.close();
  });

  /** Records hook payloads into the test database through the real capture path. */
  function record(...payloads: unknown[]): void {
    const store = new SqliteEventStore(db);
    const factory = new EventFactory();
    const service = new InvestigationService(
      new PluginHookCapture(new HookPayloadParser(), new ToolClassifier(new PayloadDigest()), factory),
      store,
      factory,
      new TimelineBuilder(),
    );
    for (const payload of payloads) {
      expect(service.recordHookPayload(payload, new Date("2026-11-09T14:30:00.000Z"))).toBe("stored");
    }
    store.close();
  }

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  async function report(sessionId = SESSION, name = "report.html"): Promise<string> {
    const out = join(directory, name);
    await expect(main(["report", sessionId, "--db", db, "--out", out])).resolves.toBe(0);
    return readFileSync(out, "utf8");
  }

  it("names the session, its agent, its start and end, and how many events it holds", async () => {
    const html = await report();
    const header = html.match(/<header class="report-header">[\s\S]*?<\/header>/)?.[0] ?? "";

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(header).toContain(SESSION);
    expect(header).toContain("opencode");
    expect(header).toContain(TRIGGER[0]?.timestamp);
    expect(header).toContain(TRIGGER[TRIGGER.length - 1]?.timestamp);
    const count = header.match(/<strong>(\d+)<\/strong> actions recorded/)?.[1];
    expect(html).toContain(`<summary>Show all ${count} recorded actions, by kind</summary>`);
    expect(header).toMatch(/sha256:[0-9a-f]{64}/);
  });

  it("lists every event once, grouped by type, in timeline order within each group, each with an anchor", async () => {
    const html = await report();

    for (const event of TRIGGER) {
      expect(html.match(new RegExp(`id="event-${event.id}"`, "g")), event.id).toHaveLength(1);
    }
    const shell = html.match(/<section class="event-group" data-type="hook\.script">[\s\S]*?<\/section>/)?.[0] ?? "";
    const expected = TRIGGER.filter((event) => event.type === "hook.script").map((event) => event.id);
    expect([...shell.matchAll(/id="event-([^"]+)"/g)].map((match) => match[1])).toEqual(expected);
  });

  it("says so when no gap or guard failure was recorded", async () => {
    const html = await report();

    expect(html).not.toContain('<section class="gaps"');
    expect(html).toContain('<div class="ok"><dt>The record</dt><dd>Complete</dd></div>');
  });

  it("lists capture gaps and guard failures with their reasons", async () => {
    record(
      { hook: "capture.gap", sessionID: SESSION, from: "2026-11-09T14:20:00.000Z", to: "2026-11-09T14:21:00.000Z", reason: "service unreachable" },
      { hook: "guard.failure", sessionID: SESSION, callID: "call_guard", tool: "edit", reason: "rules did not load: broken.yaml" },
    );

    const html = await report();
    const gaps = html.match(/<section class="gaps"[\s\S]*?<\/section>/)?.[0] ?? "";

    expect(html).toContain('<dt>The record</dt><dd>2 gaps, some actions may be missing</dd>');
    expect(gaps).toContain("service unreachable");
    expect(gaps).toContain("2026-11-09T14:20:00.000Z");
    expect(gaps).toContain("2026-11-09T14:21:00.000Z");
    expect(gaps).toContain("rules did not load: broken.yaml");
  });

  it("lists each workflow finding with its rule, why it matters and what to do", async () => {
    const html = await report();
    const findings = html.match(/<section class="findings"[\s\S]*?<\/section>/)?.[0] ?? "";
    const rules = [...findings.matchAll(/<li class="report-finding" data-rule="([^"]+)"/g)].map((match) => match[1]);

    expect([...new Set(rules)].sort()).toEqual(["exfiltration-chain", "probing", "self-modification", "sensitive-read"]);
    expect(findings).toContain("changed its own configuration");
    expect(findings.match(/What to do: /g)).toHaveLength(rules.length);
  });

  it("links every finding to events that are in the same file", async () => {
    const html = await report();
    const links = [...html.matchAll(/href="#(event-[^"]+)"/g)].map((match) => match[1]);

    expect(links.length).toBeGreaterThan(0);
    for (const anchor of links) {
      expect(html, anchor).toContain(`id="${anchor}"`);
    }
  });

  it("says so when no workflow rule matched, and lists no skipped calls", async () => {
    const html = await report(CLEAN[0]?.session_id);

    expect(html).not.toContain('<section class="findings"');
    expect(html).toContain('<div class="ok"><dt>Risky things the agent did</dt><dd>None</dd></div>');
    expect(html).not.toContain('<section class="skipped"');
  });

  it("puts the calls the guard skipped first, with the rule that skipped each and what to do", async () => {
    record({ hook: "tool.failed", input: { ...REFUSED.input, args: REFUSED.output.args }, error: "refused", blockedBy: "self-modification" });

    const html = await report(REFUSED.input.sessionID);
    const skipped = html.match(/<section class="skipped"[\s\S]*?<\/section>/)?.[0] ?? "";

    expect(skipped).toContain("1 skipped action");
    expect(skipped).toMatch(/The agent tried to <a href="#event-[^"]+">change the file /);
    expect(skipped).toContain("Stopped because: <strong>Changed its own settings or instructions</strong>");
    expect(skipped).toContain("self-modification");
    expect(skipped).toContain(String(REFUSED.output.args["filePath"]));
    expect(skipped).toContain("What to do: Review the change");
    expect(skipped).toMatch(/href="#event-[^"]+"/);
    expect(html.indexOf('<section class="skipped"')).toBeLessThan(html.indexOf('<section class="configuration"'));
  });

  it("lists each configuration finding with its rule, source, subject, entry and what to do", async () => {
    const html = await report(MISCONFIGURED[0]?.session_id);
    const section = html.match(/<section class="configuration"[\s\S]*?<\/section>/)?.[0] ?? "";
    const rules = [...section.matchAll(/<li class="config-finding" data-rule="([^"]+)"/g)].map((match) => match[1]);
    const shell = section.match(/<li class="config-finding" data-rule="shell-unrestricted"[\s\S]*?<\/li>\n/)?.[0] ?? "";

    expect([...new Set(rules)].sort()).toEqual(CONFIG_RULES);
    expect(section.match(/What to do: /g)).toHaveLength(rules.length);
    expect(shell).toContain("OWASP Top 10 for Agentic Applications ASI05");
    expect(shell).toContain("<code>risky</code>");
    expect(shell).toContain("<code>/agent/risky/permission/bash</code>");
    expect(shell).toContain("What to do: Make the agent ask before it runs commands");
    expect(rules).toHaveLength(new Set(rules).size);
  });

  it("never shows a secret from the configuration", async () => {
    const html = await report(MISCONFIGURED[0]?.session_id);

    expect(html).toContain("GITHUB_TOKEN");
    expect(html).not.toMatch(/tvexit-planted/);
  });

  it("says no configuration rule matched when the configuration is clean", async () => {
    const section = (await report(WELL_CONFIGURED[0]?.session_id)).match(/<section class="configuration"[\s\S]*?<\/section>/)?.[0] ?? "";

    expect(section).toContain("No risky settings found");
    expect(section).not.toContain("Not known");
  });

  it("says no configuration was recorded, rather than that it was clean, for a session without one", async () => {
    const section = (await report()).match(/<section class="configuration"[\s\S]*?<\/section>/)?.[0] ?? "";

    expect(section).toContain("did not record this session's settings");
    expect(section).not.toContain("No risky settings found");
  });

  it("opens with a summary in plain words", async () => {
    const summary = (await report()).match(/<section class="in-short"[\s\S]*?<\/section>/)?.[0] ?? "";

    expect(summary).toMatch(/<div class="check"><dt>Risky things the agent did<\/dt><dd>\d+ to check<\/dd><\/div>/);
    expect(summary).toContain('<div class="unknown"><dt>Risky settings</dt><dd>Not recorded</dd></div>');
    expect(summary).toContain('<div class="ok"><dt>The record</dt><dd>Complete</dd></div>');
  });

  it("names each risk by its plain title and severity, keeping the rule id for whoever checks it", async () => {
    const finding = (await report()).match(/<li class="report-finding" data-rule="self-modification"[\s\S]*?<\/li>\n/)?.[0] ?? "";

    expect(finding).toContain("<strong>Changed its own settings or instructions</strong>");
    expect(finding).toContain('<span class="severity high">Serious</span>');
    expect(finding).toContain("Rule: self-modification");
  });

  it("names one risk once, with every agent it applies to and examples marked as examples", async () => {
    const html = await report(MISCONFIGURED[0]?.session_id);
    const shell = html.match(/<li class="config-finding" data-rule="shell-unrestricted"[\s\S]*?<\/li>\n/)?.[0] ?? "";

    expect(html.match(/data-rule="shell-unrestricted"/g)).toHaveLength(1);
    expect(shell).toContain("<strong>Can run any command without asking</strong>");
    expect(shell).toMatch(/Applies to the agents? (<code>[^<]+<\/code>(, | and )?)+\./);
    expect(shell).toContain("Examples of what this allows without asking:");
  });

  it("describes events in everyday words and explains the remaining terms", async () => {
    const html = await report();
    const shell = html.match(/<section class="event-group" data-type="hook\.script">[\s\S]*?<\/section>/)?.[0] ?? "";

    expect(shell).toContain("<h3>Commands run and web pages fetched · ");
    expect(shell).toContain("ran the command curl -s http://127.0.0.1:4329/");
    expect(shell).toContain("tried to run the command wget -q http://127.0.0.1:4329/, but was refused");
    expect(shell).toContain(">Refused<");
    expect(html).toContain("<summary>What the words mean</summary>");
    expect(html).toContain("<dt>Built-in setting</dt>");
  });

  it("does not count a skipped action again as something the agent did", async () => {
    record({ hook: "tool.failed", input: { ...REFUSED.input, args: REFUSED.output.args }, error: "refused", blockedBy: "self-modification" });

    const html = await report(REFUSED.input.sessionID);

    expect(html).not.toContain('<li class="report-finding"');
    expect(html).toContain('<div class="ok"><dt>Risky things the agent did</dt><dd>None</dd></div>');
  });

  it("keeps each risk short, with the explanation, the developer's hint and the evidence behind Explain more", async () => {
    const html = await report(MISCONFIGURED[0]?.session_id);
    const shell = html.match(/<li class="config-finding" data-rule="shell-unrestricted"[\s\S]*?<\/li>\n/)?.[0] ?? "";
    const [shown, folded] = shell.split("<details><summary>Explain more</summary>");

    expect(shell.match(/<details>/g)).toHaveLength(1);
    expect(shown).toContain("What to do: Make the agent ask before it runs commands on the computer.</p>");
    expect(shown).not.toContain("For the developer");
    expect(shown).not.toContain("rm -rf /");
    expect(folded).toContain("For the developer: set bash to ask");
    expect(folded).toContain("<code>rm -rf /</code>");
    expect(folded).toContain("The agent can run commands on the computer without asking");
  });

  it("folds each workflow finding the same way, and the full record behind one click", async () => {
    const html = await report();
    const finding = html.match(/<li class="report-finding" data-rule="self-modification"[\s\S]*?<\/li>\n/)?.[0] ?? "";
    const [shown, folded] = finding.split("<details><summary>Explain more</summary>");

    expect(shown).toContain("What to do: Review the change");
    expect(shown).not.toContain("changed its own configuration");
    expect(folded).toContain("changed its own configuration");
    expect(folded).toMatch(/href="#event-/);
    expect(html).toMatch(/<details><summary>Show all \d+ recorded actions, by kind<\/summary>\n<section class="event-group"/);
  });

  it("needs nothing but the file: no script, no stylesheet or image to fetch, every link inside the file", async () => {
    const html = await report();

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/url\(/i);
    expect([...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].every((match) => match[1]?.startsWith("#"))).toBe(true);
  });

  it("writes the same bytes every time for the same session", async () => {
    expect(await report(SESSION, "one.html")).toBe(await report(SESSION, "two.html"));
  });

  it("refuses to overwrite an existing file", async () => {
    const out = join(directory, "taken.html");
    writeFileSync(out, "keep me", "utf8");

    await expect(main(["report", SESSION, "--db", db, "--out", out])).resolves.toBe(1);
    expect(readFileSync(out, "utf8")).toBe("keep me");
  });

  it("fails for an unknown session and writes nothing", async () => {
    const out = join(directory, "none.html");

    await expect(main(["report", "ses_unknown", "--db", db, "--out", out])).resolves.toBe(1);
    expect(existsSync(out)).toBe(false);
  });

  it("fails for a database that does not exist, without creating one", async () => {
    const missing = join(directory, "missing.db");

    await expect(main(["report", SESSION, "--db", missing, "--out", join(directory, "x.html")])).resolves.toBe(1);
    expect(existsSync(missing)).toBe(false);
  });

  it.each([
    ["no session id", ["report", "--db", "x.db", "--out", "x.html"]],
    ["no output file", ["report", SESSION, "--db", "x.db"]],
    ["an unknown flag", ["report", SESSION, "--port", "1"]],
  ])("fails with %s", async (_, argv) => {
    await expect(main(argv)).resolves.toBe(1);
  });

  describe("the Export report link", () => {
    async function served<T>(use: (baseUrl: string) => Promise<T>): Promise<T> {
      const { service, store } = new ServiceAssembly().open(db);
      const server = new DashboardServer(service, new SessionListView(), new TimelineView(), new ActivityView());
      try {
        return await use(`http://127.0.0.1:${await server.listen(0)}`);
      } finally {
        await server.close();
        store.close();
      }
    }

    it("sits in the session header and points at the session's report", async () => {
      const page = await served(async (baseUrl) => (await fetch(`${baseUrl}/sessions/${SESSION}`)).text());

      expect(page).toContain(`<a class="report-link" href="/sessions/${SESSION}/report">Export report</a>`);
    });

    it("downloads the same bytes the CLI writes", async () => {
      const written = await report();
      const response = await served(async (baseUrl) => {
        const answer = await fetch(`${baseUrl}/sessions/${SESSION}/report`);
        return { status: answer.status, disposition: answer.headers.get("content-disposition"), type: answer.headers.get("content-type"), body: await answer.text() };
      });

      expect(response.status).toBe(200);
      expect(response.type).toBe("text/html; charset=utf-8");
      expect(response.disposition).toBe(`attachment; filename="tracevault-report-${SESSION}.html"`);
      expect(response.body).toBe(written);
    });

    it("answers 404 for an unknown session", async () => {
      expect(await served(async (baseUrl) => (await fetch(`${baseUrl}/sessions/ses_unknown/report`)).status)).toBe(404);
    });
  });
});
