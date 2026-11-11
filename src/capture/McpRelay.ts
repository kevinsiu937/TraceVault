import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Readable, Writable } from "node:stream";

type Message = { id?: unknown; method?: unknown; params?: { cursor?: unknown }; result?: { tools?: unknown } };

/**
 * Stands between OpenCode and one local MCP server. Every byte passes through
 * unchanged, both ways; a copy of each line is read only to record the tools a
 * `tools/list` answer lists, joining pages, in a handoff file for the plugin.
 * Recording never changes, delays or drops a message.
 */
export class McpRelay {
  private child: ChildProcess | null = null;

  constructor(private readonly toolsFile: string) {}

  run(command: string, args: readonly string[], input: Readable, output: Writable, errors: Writable): Promise<number> {
    // Each pending tools/list request, and whether it asks for a further page.
    const asked = new Map<unknown, boolean>();
    let tools: unknown[] = [];
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;

    input.on("data", (chunk: Buffer) => child.stdin?.write(chunk));
    input.on("end", () => child.stdin?.end());
    child.stdin?.on("error", () => undefined);
    this.lines(input, (message) => {
      if (message.method === "tools/list" && message.id !== undefined) {
        asked.set(message.id, message.params?.cursor !== undefined);
      }
    });

    child.stdout?.on("data", (chunk: Buffer) => output.write(chunk));
    child.stderr?.on("data", (chunk: Buffer) => errors.write(chunk));
    this.lines(child.stdout, (message) => {
      const nextPage = asked.get(message.id);
      if (nextPage === undefined || !asked.delete(message.id) || !Array.isArray(message.result?.tools)) {
        return;
      }
      // A first page starts the list over, whenever its answer arrives.
      tools = nextPage ? [...tools, ...message.result.tools] : [...message.result.tools];
      this.handOff(tools);
    });

    return new Promise((resolve) => {
      child.on("error", (error) => {
        errors.write(`tracevault mcp-relay: cannot start ${command}: ${error.message}\n`);
        resolve(127);
      });
      child.on("close", (code, signal) => resolve(code ?? (signal === null ? 1 : 128)));
    });
  }

  stop(signal: NodeJS.Signals): void {
    this.child?.kill(signal);
  }

  private lines(stream: Readable | null, each: (message: Message) => void): void {
    let pending = "";
    stream?.on("data", (chunk: Buffer) => {
      const parts = (pending + chunk.toString("utf8")).split("\n");
      pending = parts.pop() ?? "";
      for (const line of parts) {
        let message: unknown;
        try {
          message = JSON.parse(line);
        } catch {
          continue; // Not JSON-RPC: it still passed through untouched.
        }
        if (message !== null && typeof message === "object") {
          each(message as Message);
        }
      }
    });
  }

  private handOff(tools: readonly unknown[]): void {
    try {
      mkdirSync(dirname(this.toolsFile), { recursive: true });
      const partial = `${this.toolsFile}.${process.pid}.tmp`;
      writeFileSync(partial, JSON.stringify({ tools }));
      renameSync(partial, this.toolsFile);
    } catch {
      // A relay that cannot record still relays.
    }
  }
}
