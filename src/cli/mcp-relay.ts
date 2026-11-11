#!/usr/bin/env node
import { McpRelay } from "../capture/McpRelay.js";

// The plugin starts this in place of a local MCP server: mcp-relay <tools-file> -- <command> [args...]
const [toolsFile, separator, command, ...args] = process.argv.slice(2);
if (toolsFile === undefined || separator !== "--" || command === undefined) {
  process.stderr.write("usage: mcp-relay <tools-file> -- <command> [args...]\n");
  process.exit(2);
}

const relay = new McpRelay(toolsFile);
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  process.on(signal, () => relay.stop(signal));
}
const code = await relay.run(command, args, process.stdin, process.stdout, process.stderr);
// Exit with the server: an open stdin would keep the relay alive, and OpenCode waits for it to exit.
process.stdout.write("", () => process.exit(code));
