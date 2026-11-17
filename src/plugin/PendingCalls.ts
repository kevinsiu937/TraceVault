/** What the before hook saw of each call still running: its arguments and when it started. */
export class PendingCalls {
  private readonly args = new Map<string, Record<string, unknown>>();
  private readonly starts = new Map<string, number>();

  constructor(private readonly now: () => number) {}

  start(key: string, args: Record<string, unknown>): void {
    this.args.set(key, args);
    this.starts.set(key, this.now());
  }

  /** The call's arguments and elapsed time, if its start was seen; both records are dropped so neither map can grow. */
  finish(key: string): { readonly args: Record<string, unknown> | undefined; readonly durationMs: number | null } {
    const args = this.args.get(key);
    const started = this.starts.get(key);
    this.args.delete(key);
    this.starts.delete(key);
    return { args, durationMs: started === undefined ? null : Math.max(0, Math.round(this.now() - started)) };
  }
}
