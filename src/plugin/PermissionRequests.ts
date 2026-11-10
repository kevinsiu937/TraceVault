export interface PermissionProperties {
  readonly id?: unknown;
  readonly sessionID?: unknown;
  readonly requestID?: unknown;
  readonly reply?: unknown;
  readonly permission?: unknown;
  readonly patterns?: unknown;
  readonly always?: unknown;
  readonly tool?: { readonly callID?: unknown };
}

export interface GrantPayload {
  readonly hook: "permission.granted";
  readonly sessionID: string;
  readonly requestID: string;
  readonly permission: unknown;
  readonly patterns: unknown;
  readonly reply: "once" | "always";
  readonly callID: unknown;
}

interface AskedRequest {
  readonly permission: unknown;
  readonly patterns: unknown;
  readonly always: unknown;
  readonly callID: unknown;
}

/**
 * A reply names only its request, so each asked request is held until its
 * reply arrives. Probed 10 Nov 2026: `once` approves the patterns shown,
 * `always` approves the request's always list, and `reject` approves nothing.
 */
export class PermissionRequests {
  private readonly asked = new Map<string, AskedRequest>();

  ask(properties: PermissionProperties): void {
    const { id, sessionID } = properties;
    if (typeof sessionID !== "string" || typeof id !== "string") {
      return;
    }
    this.asked.set(`${sessionID}:${id}`, {
      permission: properties.permission,
      patterns: properties.patterns,
      always: properties.always,
      callID: properties.tool?.callID,
    });
  }

  /** The grant a reply makes, or null. The request is forgotten either way. */
  reply(properties: PermissionProperties): GrantPayload | null {
    const { sessionID, requestID, reply } = properties;
    if (typeof sessionID !== "string" || typeof requestID !== "string") {
      return null;
    }
    const key = `${sessionID}:${requestID}`;
    const request = this.asked.get(key);
    this.asked.delete(key);
    if (request === undefined || (reply !== "once" && reply !== "always")) {
      return null;
    }
    return {
      hook: "permission.granted",
      sessionID,
      requestID,
      permission: request.permission,
      patterns: reply === "always" ? request.always : request.patterns,
      reply,
      callID: request.callID,
    };
  }
}
