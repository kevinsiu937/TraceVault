import type { ImportedPartMapper } from "./ImportedPartMapper.js";
import type { SessionStoreSource } from "./SessionStoreSource.js";
import type { EventFactory } from "../schema/EventFactory.js";
import type { EventStorePort } from "../store/EventStorePort.js";

export interface ImportSummary {
  readonly sessions: number;
  readonly events: number;
  readonly skipped: number;
}

export class HistoryImport {
  constructor(
    private readonly source: SessionStoreSource,
    private readonly store: EventStorePort,
    private readonly factory: EventFactory,
    private readonly mapper: ImportedPartMapper,
  ) {}

  run(): ImportSummary | null {
    if (!this.source.isAvailable()) {
      return null;
    }

    let sessions = 0;
    let events = 0;
    let skipped = 0;

    for (const session of this.source.listSessions()) {
      const agentName = session.agent ?? "opencode";
      let imported = false;

      const startId = `session_store:${session.id}:start`;
      if (this.store.hasEventOfType(session.id, "session.start", "plugin_hook")) {
        // Live capture already saw this session's boundary; the imported one would double it.
        skipped += 1;
      } else if (this.appendIfNew(startId)) {
        this.store.append(
          this.factory.sessionStart({
            sessionId: session.id,
            correlationId: startId,
            receivedAt: session.createdAt,
            agentName,
            ...(session.title.length > 0 ? { title: session.title } : {}),
            parentSessionId: session.parentId,
          }),
        );
        events += 1;
        imported = true;
      } else {
        skipped += 1;
      }

      for (const part of this.source.listParts(session.id)) {
        for (const mapped of this.mapper.map(part)) {
          if (!this.appendIfNew(mapped.correlationId)) {
            skipped += 1;
            continue;
          }
          this.store.append(
            this.factory.fromClassified(
              {
                sessionId: session.id,
                correlationId: mapped.correlationId,
                receivedAt: mapped.timestamp,
                agentName,
                durationMs: mapped.durationMs,
              },
              mapped.classified,
            ),
          );
          events += 1;
          imported = true;
        }
      }

      const endId = `session_store:${session.id}:end`;
      if (this.store.hasEventOfType(session.id, "session.end", "plugin_hook")) {
        skipped += 1;
      } else if (this.appendIfNew(endId)) {
        this.store.append(
          this.factory.sessionEnd({
            sessionId: session.id,
            correlationId: endId,
            receivedAt: session.updatedAt,
            agentName,
          }),
        );
        events += 1;
        imported = true;
      } else {
        skipped += 1;
      }

      if (imported) {
        sessions += 1;
      }
    }

    return { sessions, events, skipped };
  }

  private appendIfNew(correlationId: string): boolean {
    return this.store.findByCorrelation(correlationId) === null;
  }
}
