import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildComposerPromptHistoryEntries,
  stepComposerPromptHistory,
  type ComposerPromptHistoryMessage,
  type ComposerPromptHistoryPosition,
} from "@t3tools/shared/composerPromptHistory";
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
  const [position, setPositionState] = useState<ComposerPromptHistoryPosition | null>(null);
  const positionRef = useRef<ComposerPromptHistoryPosition | null>(null);
  const messagesRef = useRef(input.messages);
  messagesRef.current = input.messages;
  const ownerKeyRef = useRef(input.ownerKey);

  useEffect(() => {
    if (ownerKeyRef.current === input.ownerKey) return;
    ownerKeyRef.current = input.ownerKey;
    positionRef.current = null;
    setPositionState(null);
  }, [input.ownerKey]);

  const setPosition = useCallback((next: ComposerPromptHistoryPosition | null) => {
    positionRef.current = next;
    setPositionState(next);
  }, []);

  const blocked = isComposerPromptHistoryRecallBlocked({
    voiceBusy: input.voiceBusy,
    freezesEditor: input.freezesEditor,
    attachmentCount: input.attachmentCount,
    hasContextImports: input.hasContextImports,
  });

  const step = useCallback(
    (direction: "backward" | "forward") => {
      if (blocked) return;
      const result = stepComposerPromptHistory({
        direction,
        entries: buildComposerPromptHistoryEntries(messagesRef.current),
        position: positionRef.current,
        currentPrompt: input.draftMessage,
      });
      if (!result) return;
      setPosition(result.position);
      if (result.prompt !== input.draftMessage) input.onRecall(result.prompt);
    },
    [blocked, input.draftMessage, input.onRecall, setPosition],
  );

  const reset = useCallback(() => setPosition(null), [setPosition]);

  const recallOlder = useCallback(() => step("backward"), [step]);
  const recallNewer = useCallback(() => step("forward"), [step]);

  const browsing = position !== null && position.recalled === input.draftMessage;
  const hasRecallableText = useMemo(
    () =>
      input.messages.some((message) => message.role === "user" && message.text.trim().length > 0),
    [input.messages],
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
