export interface ChatMessageInput {
  sessionID?: string;
}

interface MessagePart {
  type?: string;
  text?: string;
}

export interface ChatMessageOutput {
  message?: {
    id?: string;
    role?: string;
    sessionID?: string;
    time?: {
      created?: number;
    };
  };
  parts?: MessagePart[];
}

export interface UserPromptPayload {
  readonly hook: "chat.message";
  readonly sessionID: string;
  readonly messageID: string;
  readonly createdAt: string;
  readonly text: string;
  readonly truncated: boolean;
}

const PROMPT_LIMIT = 4000;

/** Turns OpenCode's `chat.message` hook into the prompt the service stores, or null for anything that is not a user's text. */
export class UserPrompt {
  of(input: ChatMessageInput, output: ChatMessageOutput): UserPromptPayload | null {
    const message = output.message;
    if (message?.role !== "user") {
      return null;
    }
    const sessionID = message.sessionID ?? input.sessionID;
    const created = message.time?.created;
    if (typeof sessionID !== "string" || typeof message.id !== "string") {
      return null;
    }
    if (typeof created !== "number" || !Number.isFinite(created)) {
      return null;
    }
    const at = new Date(created);
    if (!Number.isFinite(at.getTime())) {
      return null;
    }

    const text = (output.parts ?? [])
      .flatMap((part) => (part.type === "text" && typeof part.text === "string" ? [part.text] : []))
      .join(" ")
      .trim();
    if (text.length === 0) {
      return null;
    }

    // The text is the evidence a rule reads, so most of it is kept; the timeline row cuts it for reading.
    const truncated = text.length > PROMPT_LIMIT;
    return {
      hook: "chat.message",
      sessionID,
      messageID: message.id,
      createdAt: at.toISOString(),
      text: truncated ? text.slice(0, PROMPT_LIMIT) : text,
      truncated,
    };
  }
}
