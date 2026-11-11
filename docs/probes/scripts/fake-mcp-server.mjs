// A minimal MCP server over stdio, for probes and exit runs only. It offers the
// tools listed in the JSON file named by its first argument and refuses every
// call, so nothing it describes can ever run. No dependencies.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const tools = JSON.parse(readFileSync(process.argv[2], "utf8"));
const reply = (id, body) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, ...body }) + "\n");

createInterface({ input: process.stdin }).on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.id === undefined) {
    return;
  }
  if (message.method === "initialize") {
    reply(message.id, {
      result: {
        protocolVersion: message.params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "tracevault-fake", version: "1.0.0" },
      },
    });
  } else if (message.method === "tools/list") {
    reply(message.id, { result: { tools } });
  } else if (message.method === "ping") {
    reply(message.id, { result: {} });
  } else if (message.method === "tools/call") {
    reply(message.id, { result: { isError: true, content: [{ type: "text", text: "This test server runs nothing." }] } });
  } else {
    reply(message.id, { error: { code: -32601, message: `method not found: ${message.method}` } });
  }
});
