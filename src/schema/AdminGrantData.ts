/**
 * A permission the user approved at a prompt. `patterns` is what the approval
 * covers: the patterns shown for a `once` reply, the wider list OpenCode offers
 * for an `always` reply. `call_id` is the call that raised the prompt.
 */
export interface AdminGrantData {
  readonly permission: string;
  readonly patterns: readonly string[];
  readonly reply: "once" | "always";
  readonly call_id?: string;
}
