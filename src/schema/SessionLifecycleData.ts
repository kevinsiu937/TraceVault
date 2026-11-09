export interface SessionLifecycleData {
  readonly title?: string;
  readonly parent_session_id?: string | null;
  /** The folder the session worked in, as the agent reported it. Absent on rows stored before Phase 2. */
  readonly project_dir?: string;
}
