/** `window: { seconds: n }`: a chain must finish within n seconds of its first event. `window: session` has no limit. */
export class DurationWindow {
  constructor(private readonly milliseconds: number) {}

  contains(startedAt: number, at: number): boolean {
    return at - startedAt <= this.milliseconds;
  }
}
