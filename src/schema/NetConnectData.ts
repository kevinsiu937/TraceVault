/**
 * One connection the agent's shell made through TraceVault's proxy: where it
 * went and whether the upstream answered. Never a path, header or body, which
 * can carry the data being sent.
 */
export interface NetConnectData {
  readonly host: string;
  readonly port: number;
  /** `https` for a CONNECT tunnel, `http` for a plain request. */
  readonly kind: "https" | "http";
  /** The bash call the proxy address named. */
  readonly call_id: string | null;
  readonly opened: boolean;
}
