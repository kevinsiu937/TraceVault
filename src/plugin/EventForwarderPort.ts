export interface EventForwarderPort {
  forward(payload: unknown): Promise<void>;
}
