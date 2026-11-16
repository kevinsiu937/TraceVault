// One of several processes that append to the same database at once (integrity.seam.test.ts).
// Usage: vite-node integrity.writer.ts <db> <name> <count>. It prints "ready", then waits for a line on stdin.
import { EventFactory } from "../../src/schema/EventFactory.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

const [dbPath = "", name = "", count = "0"] = process.argv.slice(2);
const store = new SqliteEventStore(dbPath);
const factory = new EventFactory();

process.stdout.write("ready\n");
process.stdin.once("data", () => {
  for (let index = 0; index < Number(count); index += 1) {
    store.append(
      factory.fromClassified(
        { sessionId: `ses_${name}`, correlationId: `call_${name}_${index}`, receivedAt: new Date(Date.UTC(2026, 9, 25, 10, 0, index)) },
        { type: "hook.script", data: { hook: "tool.execute.after", target_tool: "bash", target: `echo ${index}`, exit_code: 0, outcome: "ok" } },
      ),
    );
  }
  store.close();
  process.exit(0);
});
