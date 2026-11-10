/**
 * The opt-in guard could not decide on a call and let it through unchecked.
 * The call's id lives here, not in the envelope's correlation id, so the call's
 * own event is never mistaken for a duplicate of this one.
 */
export interface GuardFailureData {
  readonly tool: string;
  readonly call_id: string;
  readonly reason: string;
}
