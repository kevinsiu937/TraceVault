import type { Event } from "../schema/Event.js";

export interface CapturePort {
  toEvent(raw: unknown, receivedAt: Date): Event | null;
}
