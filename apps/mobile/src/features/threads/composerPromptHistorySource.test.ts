import { describe, expect, it } from "vite-plus/test";

import {
  isComposerPromptHistoryRecallBlocked,
  mergeComposerPromptHistoryMessages,
  resolveComposerPromptHistoryButtons,
} from "./composerPromptHistorySource.ts";

describe("mergeComposerPromptHistoryMessages", () => {
  it("appends queued outbox texts after the acknowledged messages as user entries", () => {
    expect(
      mergeComposerPromptHistoryMessages({
        messages: [
          { id: "m1", role: "user", text: "first" },
          { id: "a1", role: "assistant", text: "reply" },
        ],
        queuedMessages: [{ messageId: "q1", text: "follow-up" }],
      }),
    ).toEqual([
      { id: "m1", role: "user", text: "first" },
      { id: "a1", role: "assistant", text: "reply" },
      { id: "q1", role: "user", text: "follow-up" },
    ]);
  });

  it("keeps the just-sent prompt recallable before the server ack lands", () => {
    const merged = mergeComposerPromptHistoryMessages({
      messages: [],
      queuedMessages: [
        { messageId: "q1", text: "just sent" },
        { messageId: "q2", text: "queued behind it" },
      ],
    });
    expect(merged.map((message) => message.id)).toEqual(["q1", "q2"]);
    expect(merged.every((message) => message.role === "user")).toBe(true);
  });

  it("returns an empty source with no messages and no queued texts", () => {
    expect(mergeComposerPromptHistoryMessages({ messages: [], queuedMessages: [] })).toEqual([]);
  });
});

describe("isComposerPromptHistoryRecallBlocked", () => {
  it("blocks while dictation owns the editor", () => {
    expect(
      isComposerPromptHistoryRecallBlocked({
        voiceBusy: true,
        freezesEditor: false,
        attachmentCount: 0,
        hasContextImports: false,
      }),
    ).toBe(true);
    expect(
      isComposerPromptHistoryRecallBlocked({
        voiceBusy: false,
        freezesEditor: true,
        attachmentCount: 0,
        hasContextImports: false,
      }),
    ).toBe(true);
  });

  it("blocks with attachments or context imports aboard", () => {
    expect(
      isComposerPromptHistoryRecallBlocked({
        voiceBusy: false,
        freezesEditor: false,
        attachmentCount: 1,
        hasContextImports: false,
      }),
    ).toBe(true);
    expect(
      isComposerPromptHistoryRecallBlocked({
        voiceBusy: false,
        freezesEditor: false,
        attachmentCount: 0,
        hasContextImports: true,
      }),
    ).toBe(true);
  });

  it("allows recall from an empty, idle composer", () => {
    expect(
      isComposerPromptHistoryRecallBlocked({
        voiceBusy: false,
        freezesEditor: false,
        attachmentCount: 0,
        hasContextImports: false,
      }),
    ).toBe(false);
  });
});

describe("resolveComposerPromptHistoryButtons", () => {
  it("enables Up only from an empty draft and Down only while browsing", () => {
    expect(
      resolveComposerPromptHistoryButtons({
        blocked: false,
        hasRecallableText: true,
        draftLength: 0,
        browsing: false,
      }),
    ).toEqual({ canRecallOlder: true, canRecallNewer: false });
    expect(
      resolveComposerPromptHistoryButtons({
        blocked: false,
        hasRecallableText: true,
        draftLength: 0,
        browsing: true,
      }),
    ).toEqual({ canRecallOlder: true, canRecallNewer: true });
    expect(
      resolveComposerPromptHistoryButtons({
        blocked: false,
        hasRecallableText: true,
        draftLength: 7,
        browsing: false,
      }),
    ).toEqual({ canRecallOlder: false, canRecallNewer: false });
  });

  it("disables both buttons while blocked or without recallable text", () => {
    expect(
      resolveComposerPromptHistoryButtons({
        blocked: true,
        hasRecallableText: true,
        draftLength: 0,
        browsing: true,
      }),
    ).toEqual({ canRecallOlder: false, canRecallNewer: false });
    expect(
      resolveComposerPromptHistoryButtons({
        blocked: false,
        hasRecallableText: false,
        draftLength: 0,
        browsing: false,
      }),
    ).toEqual({ canRecallOlder: false, canRecallNewer: false });
  });
});
