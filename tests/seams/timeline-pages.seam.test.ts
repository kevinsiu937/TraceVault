import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ServiceAssembly } from "../../src/cli/ServiceAssembly.js";
import { main } from "../../src/cli/index.js";
import { EventFactory } from "../../src/schema/EventFactory.js";

const LONG = "ses_long";
const SHORT = "ses_short";
// 1,101 rows: pages of 500, 500 and 101. Odd rows fail, so 550 rows are errors.
const ROWS = 1100;

function shell(sessionId: string, index: number): Parameters<EventFactory["fromClassified"]> {
  const at = new Date(Date.UTC(2026, 10, 16, 9, 0, 0) + (index + 1) * 1000);
  const outcome = index % 2 === 1 ? "error" : "ok";
  return [
    { sessionId, correlationId: `call_${sessionId}_${index}`, receivedAt: at },
    { type: "hook.script", data: { hook: "tool.execute.after", target_tool: "bash", target: `echo row-${String(index).padStart(4, "0")}`, exit_code: outcome === "ok" ? 0 : 1, outcome } },
  ];
}

/** The rows the timeline draws, by the command each one ran. */
function rows(page: string): string[] {
  const timeline = page.match(/<ol class="timeline" id="timeline"[\s\S]*?<\/ol>/)?.[0] ?? "";
  return [...new Set([...timeline.matchAll(/echo (row-\d{4})/g)].map((match) => match[1] ?? ""))];
}

describe("seam A: a long session's timeline in pages", () => {
  let directory: string;
  let db: string;
  let baseUrl: string;
  let close: () => Promise<void>;
  let ids: Map<string, string>;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-pages-"));
    db = join(directory, "events.db");
    const factory = new EventFactory();
    const { service, store, server } = new ServiceAssembly().open(db);
    // A secret read first, so the only finding and the only file are far from the newest page.
    store.append(
      factory.fromClassified(
        { sessionId: LONG, correlationId: "call_env", receivedAt: new Date(Date.UTC(2026, 10, 16, 9)) },
        { type: "document.access", data: { path: "/home/dev/demo/.env", operation: "read", outcome: "ok" } },
      ),
    );
    for (let index = 0; index < ROWS; index += 1) {
      store.append(factory.fromClassified(...shell(LONG, index)));
    }
    for (let index = 0; index < 3; index += 1) {
      store.append(factory.fromClassified(...shell(SHORT, index)));
    }
    ids = new Map(service.getTimeline(LONG).map((entry) => [entry.target, entry.eventId]));
    baseUrl = `http://127.0.0.1:${await server.listen(0)}`;
    close = async () => {
      await server.close();
      store.close();
    };
  });

  afterAll(async () => {
    await close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function page(path: string): Promise<string> {
    return (await fetch(`${baseUrl}${path}`)).text();
  }

  it("shows the newest page of a long session, with a link to the one before and none after", async () => {
    const html = await page(`/sessions/${LONG}`);

    expect(rows(html)).toEqual(Array.from({ length: 101 }, (_, index) => `row-${String(999 + index).padStart(4, "0")}`));
    expect(html).toContain("Page 3 of 3");
    expect(html).toContain(`<a rel="prev" href="/sessions/${LONG}?page=2">`);
    expect(html).not.toContain('rel="next"');
  });

  it("opens an older page on request, with links both ways", async () => {
    const html = await page(`/sessions/${LONG}?page=2`);

    expect(rows(html)).toEqual(Array.from({ length: 500 }, (_, index) => `row-${String(499 + index).padStart(4, "0")}`));
    expect(html).toContain("Page 2 of 3");
    expect(html).toContain(`<a rel="prev" href="/sessions/${LONG}?page=1">`);
    expect(html).toContain(`<a rel="next" href="/sessions/${LONG}?page=3">`);
  });

  it("shows a session shorter than a page whole, with no page links", async () => {
    const html = await page(`/sessions/${SHORT}`);

    expect(rows(html)).toEqual(["row-0000", "row-0001", "row-0002"]);
    expect(html).not.toContain('class="pages"');
  });

  it("pages only the rows the filter matches, and counts only those", async () => {
    const html = await page(`/sessions/${LONG}?outcome=error`);

    expect(rows(html)).toEqual(Array.from({ length: 50 }, (_, index) => `row-${1001 + 2 * index}`));
    expect(html).toContain("550 of 1101 events");
    expect(html).toContain("Page 2 of 2");
    expect(html).toContain(`<a rel="prev" href="/sessions/${LONG}?outcome=error&amp;page=1">`);
  });

  it("opens the page that holds a linked event, with that event selected", async () => {
    const id = ids.get("echo row-0010") ?? "";
    const html = await page(`/sessions/${LONG}?event=${id}`);

    expect(rows(html)).toContain("row-0010");
    expect(html).toContain("Page 1 of 3");
    expect(html).toMatch(new RegExp(`data-event-id="${id}"[^>]*>\\s*<a class="event-row selected"`));
  });

  it("keeps the findings, the file rail and the header counts about the whole session", async () => {
    const html = await page(`/sessions/${LONG}`);

    expect(html).toContain('data-rule="sensitive-read"');
    expect(html).toMatch(/Files · 1</);
    expect(html).toContain('<span class="stat-value">1101</span> <span class="stat-label">events</span>');
    expect(html).toContain('<span class="stat-value">550</span> <span class="stat-label">errors</span>');
  });

  it("still lists every row in the report, the same bytes from the CLI and from the page", async () => {
    const out = join(directory, "report.html");
    await expect(main(["report", LONG, "--db", db, "--out", out])).resolves.toBe(0);
    const written = readFileSync(out, "utf8");

    expect(written.match(/id="event-/g)).toHaveLength(ROWS + 1);
    expect(await page(`/sessions/${LONG}/report`)).toBe(written);
  });
});
