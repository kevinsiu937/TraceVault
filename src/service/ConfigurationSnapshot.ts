/** The latest configuration recorded in a session, secrets already replaced. */
export interface ConfigurationSnapshot {
  readonly eventId: string;
  readonly recordedAt: string;
  readonly digest: string;
  readonly config: Readonly<Record<string, unknown>>;
  /** The latest tool list of each local MCP server, in the order the servers first listed. */
  readonly mcpTools: readonly { readonly eventId: string; readonly server: string; readonly tools: readonly Readonly<Record<string, unknown>>[] }[];
  /** Each time the developer accepted one of these servers' tool lists, oldest first. */
  readonly acceptances: readonly { readonly server: string; readonly acceptedAt: string }[];
}
