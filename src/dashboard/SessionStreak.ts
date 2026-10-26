import type { SessionSummary } from "../service/SessionSummary.js";

export class SessionStreak {
  find(summaries: readonly SessionSummary[]): SessionSummary[][] {
    const streaks: SessionSummary[][] = [];
    let run: SessionSummary[] = [];

    for (const summary of summaries) {
      if (summary.lastOutcome === "error") {
        run.push(summary);
        continue;
      }
      this.flush(run, streaks);
      run = [];
    }
    this.flush(run, streaks);

    return streaks;
  }

  private flush(run: SessionSummary[], streaks: SessionSummary[][]): void {
    if (run.length >= 2) {
      streaks.push(run);
    }
  }
}
