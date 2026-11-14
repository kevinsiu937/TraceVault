import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { main } from "../../src/cli/index.js";
import { ServiceAssembly } from "../../src/cli/ServiceAssembly.js";
import { ActivityView } from "../../src/dashboard/ActivityView.js";
import { DashboardServer } from "../../src/dashboard/DashboardServer.js";
import { DetailPaneView } from "../../src/dashboard/DetailPaneView.js";
import { FindingsPanelView } from "../../src/dashboard/FindingsPanelView.js";
import { RulesNoticeView } from "../../src/dashboard/RulesNoticeView.js";
import { SessionHeaderView } from "../../src/dashboard/SessionHeaderView.js";
import { SessionListView } from "../../src/dashboard/SessionListView.js";
import { SessionPageView } from "../../src/dashboard/SessionPageView.js";
import { TimelineView } from "../../src/dashboard/TimelineView.js";
import { EventFactory } from "../../src/schema/EventFactory.js";

const RULES = join(import.meta.dirname, "../../rules");
const SESSION = "ses_then";
const OLD = "ses_before_rule_history";

function read(filePath: string, callID: string): Record<string, unknown> {
  return {
    hook: "tool.execute.after",
    input: { tool: "read", sessionID: SESSION, callID, args: { filePath } },
    output: { title: "t", metadata: { truncated: false } },
  };
}

describe("a session viewed under the rules then and now", () => {
  let directory: string;
  let db: string;
  let then: string;
  const now = RULES;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-rules-then-test-"));
    db = join(directory, "events.db");
    then = join(directory, "rules-then");
    cpSync(RULES, then, { recursive: true });
    // The rules back then had no rule for secret reads; today's do, so then and now disagree on this session.
    rmSync(join(then, "sensitive-read.yaml"));

    const { service, store } = new ServiceAssembly(then).open(db);
    expect(service.recordHookPayload(read("/home/dev/demo/.env", "call_env"), new Date("2026-11-13T09:00:00.000Z"))).toBe("stored");
    // A session stored without going through capture, as sessions recorded before rule sets were kept.
    store.append(new EventFactory().sessionStart({ sessionId: OLD, correlationId: null, receivedAt: new Date("2026-11-01T09:00:00.000Z") }));
    store.close();
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function today() {
    return new ServiceAssembly(now).open(db);
  }

  it("seam C: finds under the stored rules exactly what those rules find when loaded from disk", () => {
    const fromDisk = new ServiceAssembly(then).open(db);
    const expected = fromDisk.service.getFindings(SESSION);
    fromDisk.store.close();

    const { service, store } = today();
    try {
      expect(expected.map((finding) => finding.ruleId)).not.toContain("sensitive-read");
      expect(service.getFindings(SESSION, "then")).toEqual(expected);
      expect(service.getFindings(SESSION).map((finding) => finding.ruleId)).toContain("sensitive-read");
      expect(service.getRuleVersions(SESSION)).toBe("different");
    } finally {
      store.close();
    }
  });

  async function page(path: string): Promise<string> {
    const { service, store } = today();
    const server = new DashboardServer(
      service,
      new SessionListView(),
      new TimelineView(),
      new ActivityView(),
      undefined,
      new SessionPageView(new SessionHeaderView(), [new RulesNoticeView(), new FindingsPanelView(), new TimelineView()], new DetailPaneView()),
    );
    try {
      return await (await fetch(`http://127.0.0.1:${await server.listen(0)}${path}`)).text();
    } finally {
      await server.close();
      store.close();
    }
  }

  it("shows today's rules by default, says the old rules disagree, and shows those under ?rules=then", async () => {
    const current = await page(`/sessions/${SESSION}`);
    const old = await page(`/sessions/${SESSION}?rules=then`);

    expect(current).toContain('<li class="finding" data-rule="sensitive-read"');
    expect(current).toContain("These findings use today's rules. The rules from when this session was recorded give a different result.");
    expect(current).toContain(`href="/sessions/${SESSION}?rules=then"`);
    expect(old).not.toContain('data-rule="sensitive-read"');
    expect(old).toContain("These findings use the rules from when this session was recorded.");
    expect(old).toContain(`href="/sessions/${SESSION}"`);
  });

  it("says plainly when the rules from a session's time were not kept", async () => {
    expect(await page(`/sessions/${OLD}`)).toContain("The rules from when this session was recorded were not kept");
  });

  it("offers the same choice in the report", async () => {
    const out = (name: string): string => join(directory, name);
    const argv = (file: string, ...rest: string[]): string[] => ["report", SESSION, "--db", db, "--out", out(file), ...rest];

    await expect(main(argv("now.html"))).resolves.toBe(0);
    await expect(main(argv("then.html", "--rules", "then"))).resolves.toBe(0);
    const nowReport = readFileSync(out("now.html"), "utf8");
    const thenReport = readFileSync(out("then.html"), "utf8");

    expect(nowReport).toContain("These findings use today's rules. The rules from when this session was recorded give a different result.");
    expect(nowReport).toContain('data-rule="sensitive-read"');
    expect(thenReport).toContain("These findings use the rules from when this session was recorded.");
    expect(thenReport).not.toContain('data-rule="sensitive-read"');
    await expect(main(argv("bad.html", "--rules", "yesterday"))).resolves.toBe(1);
  });
});
