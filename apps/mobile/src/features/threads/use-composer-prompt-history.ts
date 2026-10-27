import { useState } from "react";
import {
  buildComposerPromptHistoryEntries,
  stepComposerPromptHistory,
  type ComposerPromptHistoryMessage,
  type ComposerPromptHistoryPosition,
} from "@t3tools/client-runtime/composer-prompt-history";
import {
  isComposerPromptHistoryRecallBlocked,
  resolveComposerPromptHistoryButtons,
} from "./composerPromptHistorySource";

export function useComposerPromptHistory(input: {
  readonly ownerKey: string;
  readonly messages: ReadonlyArray<ComposerPromptHistoryMessage>;
  readonly draftMessage: string;
  readonly voiceBusy: boolean;
  readonly freezesEditor: boolean;
  readonly attachmentCount: number;
  readonly hasContextImports: boolean;
  readonly onRecall: (prompt: string) => void;
}) {
  const [state, setState] = useState<{
    readonly ownerKey: string;
    readonly position: ComposerPromptHistoryPosition | null;
  }>({ ownerKey: input.ownerKey, position: null });
  const position = state.ownerKey === input.ownerKey ? state.position : null;
  const setPosition = (next: ComposerPromptHistoryPosition | null) =>
    setState({ ownerKey: input.ownerKey, position: next });

  const blocked = isComposerPromptHistoryRecallBlocked({
    voiceBusy: input.voiceBusy,
    freezesEditor: input.freezesEditor,
    attachmentCount: input.attachmentCount,
    hasContextImports: input.hasContextImports,
  });

  const step = (direction: "backward" | "forward") => {
    if (blocked) return;
    const result = stepComposerPromptHistory({
      direction,
      entries: buildComposerPromptHistoryEntries(input.messages),
      position,
      currentPrompt: input.draftMessage,
    });
    if (!result) return;
    setPosition(result.position);
    if (result.prompt !== input.draftMessage) input.onRecall(result.prompt);
  };

  const reset = () => setPosition(null);
  const recallOlder = () => step("backward");
  const recallNewer = () => step("forward");

  const browsing = position !== null && position.recalled === input.draftMessage;
  const hasRecallableText = input.messages.some(
    (message) => message.role === "user" && message.text.trim().length > 0,
  );

  return {
    ...resolveComposerPromptHistoryButtons({
      blocked,
      hasRecallableText,
      draftLength: input.draftMessage.length,
      browsing,
    }),
    recallOlder,
    recallNewer,
    reset,
  };
}
