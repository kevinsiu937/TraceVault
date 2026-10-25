import type { EventQuery } from "./EventQuery.js";

const TARGET = `CASE type
  WHEN 'document.access' THEN json_extract(body, '$.data.path')
  WHEN 'hook.script' THEN json_extract(body, '$.data.target')
  WHEN 'mcp.call' THEN json_extract(body, '$.data.server') || ' · ' || json_extract(body, '$.data.tool')
  WHEN 'skill.call' THEN json_extract(body, '$.data.skill')
  WHEN 'capture.gap' THEN json_extract(body, '$.data.reason')
  ELSE 'session'
END`;

const OUTCOME = `CASE type
  WHEN 'capture.gap' THEN 'gap'
  WHEN 'capture.duplicate' THEN 'duplicate'
  WHEN 'session.start' THEN 'boundary'
  WHEN 'session.end' THEN 'boundary'
  ELSE json_extract(body, '$.data.outcome')
END`;

const OPERATION = "json_extract(body, '$.data.operation')";

export interface QuerySql {
  readonly clause: string;
  readonly parameters: string[];
}

export class EventQuerySql {
  where(query: EventQuery): QuerySql {
    const clauses: string[] = [];
    const parameters: string[] = [];

    if (query.sessionId !== null) {
      clauses.push("session_id = ?");
      parameters.push(query.sessionId);
    }
    if (query.kinds.length > 0) {
      clauses.push(`type IN (${this.placeholders(query.kinds.length)})`);
      parameters.push(...query.kinds);
    }
    if (query.outcomes.length > 0) {
      clauses.push(`(${OUTCOME}) IN (${this.placeholders(query.outcomes.length)})`);
      parameters.push(...query.outcomes);
    }
    if (query.operations.length > 0) {
      clauses.push(`(${OPERATION}) IN (${this.placeholders(query.operations.length)})`);
      parameters.push(...query.operations);
    }
    if (query.text.length > 0) {
      clauses.push(`instr(lower(${TARGET}), lower(?)) > 0`);
      parameters.push(query.text);
    }

    return {
      clause: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
      parameters,
    };
  }

  private placeholders(count: number): string {
    return Array.from({ length: count }, () => "?").join(", ");
  }
}
