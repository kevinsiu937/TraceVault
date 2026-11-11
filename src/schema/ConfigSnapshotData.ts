/**
 * The configuration OpenCode resolved for the process that saw this session,
 * with every secret value already replaced by the plugin. The digest tells two
 * snapshots apart without comparing them.
 */
export interface ConfigSnapshotData {
  readonly digest: string;
  readonly config: Readonly<Record<string, unknown>>;
}
