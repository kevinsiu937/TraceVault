import type { ConfigFinding } from "../../schema/ConfigFinding.js";
import type { Event } from "../../schema/Event.js";

export type ConfigSnapshotEvent = Extract<Event, { type: "config.snapshot" }>;

/** Checks one recorded configuration against the static rules. */
export interface StaticScannerPort {
  scan(snapshot: ConfigSnapshotEvent): ConfigFinding[];
}
