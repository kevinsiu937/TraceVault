/** One archive run as the database recorded it: when, into which file beside it, and how much it moved. */
export interface StoredArchiveRun {
  readonly ranAt: string;
  /** The archive's file name, in the database's own folder. */
  readonly archive: string;
  readonly sessions: number;
  readonly events: number;
}
