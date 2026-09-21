import type { ComposerPromptHistoryMessage } from "@t3tools/shared/composerPromptHistory";

export interface ComposerPromptHistoryDetailMessage {
  readonly id: string;
  readonly role: string;
  readonly text: string;
}

export interface ComposerPromptHistoryQueuedText {
  readonly messageId: string;
  readonly text: string;
}

export interface ComposerPromptHistoryButtonState {
  readonly canRecallOlder: boolean;
  readonly canRecallNewer: boolean;
}

/**
 * Acknowledged thread messages first, queued outbox texts after: a
 * just-sent prompt sits only in the outbox until the server acks, and it
 * must stay recallable across that window. Queued creations never reach
 * here; the caller filters them out.
 */
export function mergeComposerPromptHistoryMessages(input: {
  readonly messages: ReadonlyArray<ComposerPromptHistoryDetailMessage>;
  readonly queuedMessages: ReadonlyArray<ComposerPromptHistoryQueuedText>;
}): ReadonlyArray<ComposerPromptHistoryMessage> {
  return [
    ...input.messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
    })),
    ...input.queuedMessages.map((message) => ({
      id: message.messageId,
      role: "user",
      text: message.text,
    })),
  ];
}

export function isComposerPromptHistoryRecallBlocked(input: {
  readonly voiceBusy: boolean;
  readonly freezesEditor: boolean;
  readonly attachmentCount: number;
  readonly hasContextImports: boolean;
}): boolean {
  return (
    input.voiceBusy || input.freezesEditor || input.attachmentCount > 0 || input.hasContextImports
  );
}

export function resolveComposerPromptHistoryButtons(input: {
  readonly blocked: boolean;
  readonly hasRecallableText: boolean;
  readonly draftLength: number;
  readonly browsing: boolean;
}): ComposerPromptHistoryButtonState {
  if (input.blocked || !input.hasRecallableText) {
    return { canRecallOlder: false, canRecallNewer: false };
  }
  return {
    canRecallOlder: input.draftLength === 0 || input.browsing,
    canRecallNewer: input.browsing,
  };
}
