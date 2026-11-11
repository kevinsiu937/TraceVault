/** The latest configuration recorded in a session, secrets already replaced. */
export interface ConfigurationSnapshot {
  readonly eventId: string;
  readonly recordedAt: string;
  readonly digest: string;
  readonly config: Readonly<Record<string, unknown>>;
}
