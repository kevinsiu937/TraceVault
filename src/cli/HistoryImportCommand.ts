import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DenialSignal } from "../capture/DenialSignal.js";
import { HistoryImport } from "../capture/HistoryImport.js";
import { ImportedPartMapper } from "../capture/ImportedPartMapper.js";
import { OpenCodeStoreSource } from "../capture/OpenCodeStoreSource.js";
import { PayloadDigest } from "../capture/PayloadDigest.js";
import { ToolClassifier } from "../capture/ToolClassifier.js";
import { EventFactory } from "../schema/EventFactory.js";
import type { EventStorePort } from "../store/EventStorePort.js";

const OPENCODE_STORE = join(".local", "share", "opencode", "opencode.db");

/** Finds OpenCode's own session store and imports it into a TraceVault store. */
export class HistoryImportCommand {
  /** Returns the one status line the CLI prints. */
  run(store: EventStorePort): string {
    const source = new OpenCodeStoreSource(this.agentStorePath());
    try {
      if (!source.isAvailable()) {
        return "no agent store found";
      }
      const summary = new HistoryImport(
        source,
        store,
        new EventFactory("session_store"),
        new ImportedPartMapper(new ToolClassifier(new PayloadDigest()), new DenialSignal()),
      ).run();
      if (summary === null) {
        return "no agent store found";
      }
      return `history import: ${summary.events} events from ${summary.sessions} sessions (${summary.skipped} already present)`;
    } finally {
      source.close();
    }
  }

  private agentStorePath(): string {
    const explicit = process.env["TRACEVAULT_OPENCODE_DB"];
    if (explicit !== undefined && explicit !== "") {
      return explicit;
    }

    const home = process.env["USERPROFILE"] ?? homedir();
    const candidates = [join(home, OPENCODE_STORE)];
    const localAppData = process.env["LOCALAPPDATA"];
    if (localAppData !== undefined && localAppData !== "") {
      candidates.push(join(localAppData, "opencode", "opencode.db"));
    }

    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0] ?? OPENCODE_STORE;
  }
}
