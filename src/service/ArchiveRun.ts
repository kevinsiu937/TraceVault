/** One archive run, for the session list: when it ran, the file it wrote, and how much it moved there. */
export interface ArchiveRun {
  readonly ranAt: string;
  readonly archive: string;
  readonly sessions: number;
  readonly events: number;
}
