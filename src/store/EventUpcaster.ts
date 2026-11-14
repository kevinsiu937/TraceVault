import type { Event } from "../schema/Event.js";

/**
 * Turns a stored event body into the shape the code reads today. Stored rows
 * are never rewritten, so older shapes are read forward here. A future
 * `schema_version` adds its step to this class.
 */
export class EventUpcaster {
  upcast(stored: Event): Event {
    // Rows written before duration_ms existed read back as null, never undefined.
    return stored.duration_ms === undefined ? { ...stored, duration_ms: null } : stored;
  }
}
