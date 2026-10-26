import type { DenialSignal } from "./DenialSignal.js";
import type { AgentPartRecord } from "./SessionStoreSource.js";
import type { ToolClassifier } from "./ToolClassifier.js";
import type { ClassifiedTool } from "../schema/EventFactory.js";
import type { Outcome } from "../schema/Outcome.js";

export interface MappedPart {
  readonly correlationId: string;
  readonly timestamp: Date;
  readonly durationMs: number | null;
  readonly classified: ClassifiedTool;
}

export class ImportedPartMapper {
  constructor(
    private readonly classifier: ToolClassifier,
    private readonly denial: DenialSignal,
  ) {}

  map(part: AgentPartRecord): MappedPart[] {
    const kind = part.data["type"];
    if (kind === "patch") {
      return this.mapPatch(part);
    }
    if (kind !== "tool") {
      return [];
    }

    const tool = this.asString(part.data["tool"]);
    if (tool === null) {
      return [];
    }

    const state = this.asRecord(part.data["state"]);
    const input = this.asRecord(state["input"]);
    const metadata = this.asRecord(state["metadata"]);
    const time = this.asRecord(state["time"]);
    const start = this.asNumber(time["start"]);
    const end = this.asNumber(time["end"]);
    const exitCode = this.asNumber(metadata["exit"]);
    const error = this.asString(state["error"]);
    const outcome: Outcome =
      state["status"] === "error"
        ? error !== null && this.denial.isDenial(error)
          ? "denied"
          : "error"
        : exitCode !== null && exitCode !== 0
          ? "error"
          : "ok";

    return [
      {
        // Same id the live hook uses for this call, so a session seen live and
        // later backfilled collapses at read time instead of doubling.
        correlationId: this.asString(part.data["callID"]) ?? `session_store:${part.id}`,
        timestamp: this.timestamp(part, state),
        durationMs: start !== null && end !== null && end >= start ? end - start : null,
        classified: this.classifier.classify(tool, input, outcome, exitCode),
      },
    ];
  }

  private mapPatch(part: AgentPartRecord): MappedPart[] {
    const files = part.data["files"];
    if (!Array.isArray(files)) {
      return [];
    }

    return files.flatMap((file, index) => {
      if (typeof file !== "string" || file.length === 0) {
        return [];
      }
      return [
        {
          correlationId: `session_store:${part.id}#${index}`,
          timestamp: part.createdAt,
          durationMs: null,
          classified: {
            type: "document.access" as const,
            data: { path: file, operation: "write" as const, outcome: "ok" as const },
          },
        },
      ];
    });
  }

  private timestamp(part: AgentPartRecord, state: Record<string, unknown>): Date {
    const time = this.asRecord(state["time"]);
    const end = this.asNumber(time["end"]) ?? this.asNumber(time["start"]);
    return end === null ? part.createdAt : new Date(end);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private asString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  private asNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
}
