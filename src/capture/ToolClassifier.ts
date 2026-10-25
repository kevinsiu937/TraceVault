import type { ClassifiedTool } from "../schema/EventFactory.js";
import type { DocumentOperation } from "../schema/DocumentAccessData.js";
import type { Outcome } from "../schema/Outcome.js";
import type { PayloadDigest } from "./PayloadDigest.js";

const DOCUMENT_TOOLS: Record<string, DocumentOperation> = {
  read: "read",
  write: "write",
  edit: "write",
  patch: "write",
  delete: "delete",
  rename: "rename",
};

export class ToolClassifier {
  constructor(private readonly digest: PayloadDigest) {}

  classify(
    tool: string,
    args: Record<string, unknown>,
    outcome: Outcome,
    exitCode: number | null,
  ): ClassifiedTool {
    const documentOperation = DOCUMENT_TOOLS[tool];
    if (documentOperation !== undefined) {
      const path = this.asString(args["filePath"]) ?? this.asString(args["path"]);
      if (path !== null) {
        return { type: "document.access", data: { path, operation: documentOperation, outcome } };
      }
    }

    if (tool === "skill") {
      const skill = this.asString(args["name"]) ?? this.asString(args["skill"]) ?? "unknown";
      const params = this.digest.describe(args);
      return {
        type: "skill.call",
        data: {
          skill,
          invoker: "model",
          params_digest: params.digest,
          params_size_bytes: params.sizeBytes,
          outcome,
        },
      };
    }

    if (tool.includes("_")) {
      const separator = tool.indexOf("_");
      const params = this.digest.describe(args);
      return {
        type: "mcp.call",
        data: {
          server: tool.slice(0, separator),
          tool: tool.slice(separator + 1),
          args_digest: params.digest,
          args_size_bytes: params.sizeBytes,
          outcome,
        },
      };
    }

    return {
      type: "hook.script",
      data: {
        hook: "tool.execute.after",
        target_tool: tool,
        target: this.target(tool, args),
        exit_code: exitCode,
        outcome,
      },
    };
  }

  private target(tool: string, args: Record<string, unknown>): string {
    return (
      this.asString(args["command"]) ??
      this.asString(args["url"]) ??
      this.asString(args["pattern"]) ??
      this.asString(args["path"]) ??
      this.asString(args["filePath"]) ??
      tool
    );
  }

  private asString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
  }
}
