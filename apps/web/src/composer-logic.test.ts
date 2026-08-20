import { describe, expect, it } from "vite-plus/test";

import {
  buildComposerHistoryEntries,
  clampCollapsedComposerCursor,
  collapseExpandedComposerCursor,
  cycleComposerHistoryNewer,
  cycleComposerHistoryOlder,
  detectComposerTrigger,
  expandCollapsedComposerCursor,
  isCollapsedCursorAdjacentToInlineToken,
  parseStandaloneComposerSlashCommand,
  replaceTextRange,
  resolveComposerHistoryArrowKey,
  shouldSubmitComposerOnEnter,
} from "./composer-logic";
import { INLINE_TERMINAL_CONTEXT_PLACEHOLDER } from "./lib/terminalContext";

describe("shouldSubmitComposerOnEnter", () => {
  it("submits plain Enter on desktop", () => {
    expect(shouldSubmitComposerOnEnter({ isMobileViewport: false, shiftKey: false })).toBe(true);
  });

  it("inserts a newline for plain Enter on mobile", () => {
    expect(shouldSubmitComposerOnEnter({ isMobileViewport: true, shiftKey: false })).toBe(false);
  });

  it("inserts a newline for Shift+Enter", () => {
    expect(shouldSubmitComposerOnEnter({ isMobileViewport: false, shiftKey: true })).toBe(false);
  });
});

describe("detectComposerTrigger", () => {
  it("detects @path trigger at cursor", () => {
    const text = "Please check @src/com";
    const trigger = detectComposerTrigger(text, text.length);

    expect(trigger).toEqual({
      kind: "path",
      query: "src/com",
      rangeStart: "Please check ".length,
      rangeEnd: text.length,
    });
  });

  it("detects slash command token while typing command name", () => {
    const text = "/mo";
    const trigger = detectComposerTrigger(text, text.length);

    expect(trigger).toEqual({
      kind: "slash-command",
      query: "mo",
      rangeStart: 0,
      rangeEnd: text.length,
    });
  });

  it("keeps /model as a slash command item", () => {
    const text = "/model";
    const trigger = detectComposerTrigger(text, text.length);

    expect(trigger).toEqual({
      kind: "slash-command",
      query: "model",
      rangeStart: 0,
      rangeEnd: text.length,
    });
  });

  it("does not keep a subcommand trigger active after /model arguments", () => {
    const text = "/model spark";
    const trigger = detectComposerTrigger(text, text.length);

    expect(trigger).toBeNull();
  });

  it("detects non-model slash commands while typing", () => {
    const text = "/pl";
    const trigger = detectComposerTrigger(text, text.length);

    expect(trigger).toEqual({
      kind: "slash-command",
      query: "pl",
      rangeStart: 0,
      rangeEnd: text.length,
    });
  });

  it("keeps slash command detection active for provider commands", () => {
    const text = "/rev";
    const trigger = detectComposerTrigger(text, text.length);

    expect(trigger).toEqual({
      kind: "slash-command",
      query: "rev",
      rangeStart: 0,
      rangeEnd: text.length,
    });
  });

  it("detects $skill trigger at cursor", () => {
    const text = "Use $gh-fi";
    const trigger = detectComposerTrigger(text, text.length);

    expect(trigger).toEqual({
      kind: "skill",
      query: "gh-fi",
      rangeStart: "Use ".length,
      rangeEnd: text.length,
    });
  });

  it("detects @path trigger in the middle of existing text", () => {
    // User typed @ between "inspect " and "in this sentence"
    const text = "Please inspect @in this sentence";
    const cursorAfterAt = "Please inspect @".length;

    const trigger = detectComposerTrigger(text, cursorAfterAt);
    expect(trigger).toEqual({
      kind: "path",
      query: "",
      rangeStart: "Please inspect ".length,
      rangeEnd: cursorAfterAt,
    });
  });

  it("detects @path trigger with query typed mid-text", () => {
    // User typed @sr between "inspect " and "in this sentence"
    const text = "Please inspect @srin this sentence";
    const cursorAfterQuery = "Please inspect @sr".length;

    const trigger = detectComposerTrigger(text, cursorAfterQuery);
    expect(trigger).toEqual({
      kind: "path",
      query: "sr",
      rangeStart: "Please inspect ".length,
      rangeEnd: cursorAfterQuery,
    });
  });

  it("detects trigger with true cursor even when regex-based mention detection would false-match", () => {
    // MENTION_TOKEN_REGEX can false-match plain text like "@in" as a mention.
    // The fix bypasses it by computing the expanded cursor from the Lexical node tree.
    const text = "Please inspect @in this sentence";
    const cursorAfterAt = "Please inspect @".length;

    const trigger = detectComposerTrigger(text, cursorAfterAt);
    expect(trigger).not.toBeNull();
    expect(trigger?.kind).toBe("path");
    expect(trigger?.query).toBe("");
  });
});

describe("replaceTextRange", () => {
  it("replaces a text range and returns new cursor", () => {
    const replaced = replaceTextRange("hello @src", 6, 10, "");
    expect(replaced).toEqual({
      text: "hello ",
      cursor: 6,
    });
  });
});

describe("expandCollapsedComposerCursor", () => {
  it("keeps cursor unchanged when no mention segment is present", () => {
    expect(expandCollapsedComposerCursor("plain text", 5)).toBe(5);
  });

  it("maps collapsed mention cursor to expanded text cursor", () => {
    const text = "what's in my @AGENTS.md fsfdas";
    const collapsedCursorAfterMention = "what's in my ".length + 2;
    const expandedCursorAfterMention = "what's in my @AGENTS.md ".length;

    expect(expandCollapsedComposerCursor(text, collapsedCursorAfterMention)).toBe(
      expandedCursorAfterMention,
    );
  });

  it("maps collapsed quoted mention cursor to expanded text cursor", () => {
    const text = 'what is in @"My File.md" please';
    const collapsedCursorAfterMention = "what is in ".length + 2;
    const expandedCursorAfterMention = 'what is in @"My File.md" '.length;

    expect(expandCollapsedComposerCursor(text, collapsedCursorAfterMention)).toBe(
      expandedCursorAfterMention,
    );
  });

  it("maps collapsed markdown file links to their expanded source offsets", () => {
    const text = "what's in [AGENTS.md](AGENTS.md) please";
    const collapsedCursorAfterMention = "what's in ".length + 2;
    const expandedCursorAfterMention = "what's in [AGENTS.md](AGENTS.md) ".length;

    expect(expandCollapsedComposerCursor(text, collapsedCursorAfterMention)).toBe(
      expandedCursorAfterMention,
    );
  });

  it("allows path trigger detection to close after selecting a mention", () => {
    const text = "what's in my @AGENTS.md ";
    const collapsedCursorAfterMention = "what's in my ".length + 2;
    const expandedCursor = expandCollapsedComposerCursor(text, collapsedCursorAfterMention);

    expect(detectComposerTrigger(text, expandedCursor)).toBeNull();
  });

  it("maps collapsed skill cursor to expanded text cursor", () => {
    const text = "run $review-follow-up then";
    const collapsedCursorAfterSkill = "run ".length + 2;
    const expandedCursorAfterSkill = "run $review-follow-up ".length;

    expect(expandCollapsedComposerCursor(text, collapsedCursorAfterSkill)).toBe(
      expandedCursorAfterSkill,
    );
  });
});

describe("collapseExpandedComposerCursor", () => {
  it("keeps cursor unchanged when no mention segment is present", () => {
    expect(collapseExpandedComposerCursor("plain text", 5)).toBe(5);
  });

  it("maps expanded mention cursor back to collapsed cursor", () => {
    const text = "what's in my @AGENTS.md fsfdas";
    const collapsedCursorAfterMention = "what's in my ".length + 2;
    const expandedCursorAfterMention = "what's in my @AGENTS.md ".length;

    expect(collapseExpandedComposerCursor(text, expandedCursorAfterMention)).toBe(
      collapsedCursorAfterMention,
    );
  });

  it("maps expanded quoted mention cursor back to collapsed cursor", () => {
    const text = 'what is in @"My File.md" please';
    const collapsedCursorAfterMention = "what is in ".length + 2;
    const expandedCursorAfterMention = 'what is in @"My File.md" '.length;

    expect(collapseExpandedComposerCursor(text, expandedCursorAfterMention)).toBe(
      collapsedCursorAfterMention,
    );
  });

  it("maps expanded markdown file link cursors back to collapsed offsets", () => {
    const text = "what's in [AGENTS.md](AGENTS.md) please";
    const collapsedCursorAfterMention = "what's in ".length + 2;
    const expandedCursorAfterMention = "what's in [AGENTS.md](AGENTS.md) ".length;

    expect(collapseExpandedComposerCursor(text, expandedCursorAfterMention)).toBe(
      collapsedCursorAfterMention,
    );
  });

  it("keeps package-like text expanded when another mention already exists earlier", () => {
    const text = "open @AGENTS.md then @src/index.ts ";
    const expandedCursor = text.length;
    const collapsedCursor = collapseExpandedComposerCursor(text, expandedCursor);

    expect(collapsedCursor).toBe("open ".length + 1 + " then @src/index.ts ".length);
    expect(expandCollapsedComposerCursor(text, collapsedCursor)).toBe(expandedCursor);
  });

  it("collapses only genuine mentions when package-like text exists earlier", () => {
    const text = "install @scope/pkg then @README.md ";
    const expandedCursor = text.length;
    const collapsedCursor = collapseExpandedComposerCursor(text, expandedCursor);

    expect(collapsedCursor).toBe("install @scope/pkg then ".length + 1 + " ".length);
    expect(expandCollapsedComposerCursor(text, collapsedCursor)).toBe(expandedCursor);
  });

  it("maps expanded skill cursor back to collapsed cursor", () => {
    const text = "run $review-follow-up then";
    const collapsedCursorAfterSkill = "run ".length + 2;
    const expandedCursorAfterSkill = "run $review-follow-up ".length;

    expect(collapseExpandedComposerCursor(text, expandedCursorAfterSkill)).toBe(
      collapsedCursorAfterSkill,
    );
  });
});

describe("clampCollapsedComposerCursor", () => {
  it("clamps to collapsed prompt length when mentions are present", () => {
    const text = "open @AGENTS.md then ";

    expect(clampCollapsedComposerCursor(text, text.length)).toBe(
      "open ".length + 1 + " then ".length,
    );
    expect(clampCollapsedComposerCursor(text, Number.POSITIVE_INFINITY)).toBe(
      "open ".length + 1 + " then ".length,
    );
  });
});

describe("replaceTextRange trailing space consumption", () => {
  it("double space after insertion when replacement ends with space", () => {
    // Simulates: "and then |@AG| summarize" where | marks replacement range
    // The replacement is "@AGENTS.md " (with trailing space)
    // But if we don't extend rangeEnd, the existing space stays
    const text = "and then @AG summarize";
    const rangeStart = "and then ".length;
    const rangeEnd = "and then @AG".length;

    // Without consuming trailing space: double space
    const withoutConsume = replaceTextRange(text, rangeStart, rangeEnd, "@AGENTS.md ");
    expect(withoutConsume.text).toBe("and then @AGENTS.md  summarize");

    // With consuming trailing space: single space
    const extendedEnd = text[rangeEnd] === " " ? rangeEnd + 1 : rangeEnd;
    const withConsume = replaceTextRange(text, rangeStart, extendedEnd, "@AGENTS.md ");
    expect(withConsume.text).toBe("and then @AGENTS.md summarize");
  });
});

describe("isCollapsedCursorAdjacentToInlineToken", () => {
  it("returns false when no mention exists", () => {
    expect(isCollapsedCursorAdjacentToInlineToken("plain text", 6, "left")).toBe(false);
    expect(isCollapsedCursorAdjacentToInlineToken("plain text", 6, "right")).toBe(false);
  });

  it("keeps @query typing non-adjacent while no mention pill exists", () => {
    const text = "hello @pac";
    expect(isCollapsedCursorAdjacentToInlineToken(text, text.length, "left")).toBe(false);
    expect(isCollapsedCursorAdjacentToInlineToken(text, text.length, "right")).toBe(false);
  });

  it("detects left adjacency only when cursor is directly after a mention", () => {
    const text = "open @AGENTS.md next";
    const mentionStart = "open ".length;
    const mentionEnd = mentionStart + 1;

    expect(isCollapsedCursorAdjacentToInlineToken(text, mentionEnd, "left")).toBe(true);
    expect(isCollapsedCursorAdjacentToInlineToken(text, mentionStart, "left")).toBe(false);
    expect(isCollapsedCursorAdjacentToInlineToken(text, mentionEnd + 1, "left")).toBe(false);
  });

  it("detects right adjacency only when cursor is directly before a mention", () => {
    const text = "open @AGENTS.md next";
    const mentionStart = "open ".length;
    const mentionEnd = mentionStart + 1;

    expect(isCollapsedCursorAdjacentToInlineToken(text, mentionStart, "right")).toBe(true);
    expect(isCollapsedCursorAdjacentToInlineToken(text, mentionEnd, "right")).toBe(false);
    expect(isCollapsedCursorAdjacentToInlineToken(text, mentionStart - 1, "right")).toBe(false);
  });

  it("treats terminal pills as inline tokens for adjacency checks", () => {
    const text = `open ${INLINE_TERMINAL_CONTEXT_PLACEHOLDER} next`;
    const tokenStart = "open ".length;
    const tokenEnd = tokenStart + 1;

    expect(isCollapsedCursorAdjacentToInlineToken(text, tokenEnd, "left")).toBe(true);
    expect(isCollapsedCursorAdjacentToInlineToken(text, tokenStart, "right")).toBe(true);
  });

  it("treats skill pills as inline tokens for adjacency checks", () => {
    const text = "run $review-follow-up next";
    const tokenStart = "run ".length;
    const tokenEnd = tokenStart + 1;

    expect(isCollapsedCursorAdjacentToInlineToken(text, tokenEnd, "left")).toBe(true);
    expect(isCollapsedCursorAdjacentToInlineToken(text, tokenStart, "right")).toBe(true);
  });
});

describe("buildComposerHistoryEntries", () => {
  it("keeps only the user's own messages, most-recent-first", () => {
    const messages = [
      { role: "user" as const, text: "first" },
      { role: "assistant" as const, text: "reply" },
      { role: "user" as const, text: "second" },
      { role: "system" as const, text: "note" },
      { role: "user" as const, text: "third" },
    ];

    expect(buildComposerHistoryEntries(messages)).toEqual(["third", "second", "first"]);
  });

  it("substitutes [image removed] for each image attachment after the message text", () => {
    const messages = [
      {
        role: "user" as const,
        text: "check this out",
        attachments: [{ type: "image" }, { type: "image" }],
      },
    ];

    expect(buildComposerHistoryEntries(messages)).toEqual([
      "check this out\n[image removed]\n[image removed]",
    ]);
  });

  it("substitutes [image removed] with no leading text when the message was image-only", () => {
    const messages = [{ role: "user" as const, text: "", attachments: [{ type: "image" }] }];

    expect(buildComposerHistoryEntries(messages)).toEqual(["[image removed]"]);
  });

  it("returns an empty list when the user has no messages yet", () => {
    expect(buildComposerHistoryEntries([{ role: "assistant" as const, text: "hi" }])).toEqual([]);
  });
});

describe("cycleComposerHistoryOlder", () => {
  it("stashes the current draft and jumps to the most recent history entry", () => {
    const step = cycleComposerHistoryOlder(null, "unsent draft", ["newest", "middle", "oldest"]);

    expect(step).toEqual({
      nextState: { stashedDraft: "unsent draft", index: 0 },
      text: "newest",
    });
  });

  it("steps further back on each subsequent call, preserving the stashed draft", () => {
    const entries = ["newest", "middle", "oldest"];
    const first = cycleComposerHistoryOlder(null, "unsent draft", entries);
    const second = cycleComposerHistoryOlder(first?.nextState ?? null, "unsent draft", entries);

    expect(second).toEqual({
      nextState: { stashedDraft: "unsent draft", index: 1 },
      text: "middle",
    });
  });

  it("is a no-op once the oldest entry is reached", () => {
    const entries = ["newest", "middle", "oldest"];
    const atOldest = { stashedDraft: "unsent draft", index: 2 };

    expect(cycleComposerHistoryOlder(atOldest, "unsent draft", entries)).toBeNull();
  });

  it("is a no-op when there is no history to cycle into", () => {
    expect(cycleComposerHistoryOlder(null, "unsent draft", [])).toBeNull();
  });
});

describe("cycleComposerHistoryNewer", () => {
  it("is a no-op when not currently cycling", () => {
    expect(cycleComposerHistoryNewer(null, ["newest", "middle"])).toBeNull();
  });

  it("steps toward the newest entry while mid-history", () => {
    const entries = ["newest", "middle", "oldest"];
    const state = { stashedDraft: "unsent draft", index: 2 };

    expect(cycleComposerHistoryNewer(state, entries)).toEqual({
      nextState: { stashedDraft: "unsent draft", index: 1 },
      text: "middle",
    });
  });

  it("restores the exact stashed draft and stops cycling once past the newest entry", () => {
    const state = { stashedDraft: "unsent draft, verbatim  ", index: 0 };

    expect(cycleComposerHistoryNewer(state, ["newest", "middle"])).toEqual({
      nextState: null,
      text: "unsent draft, verbatim  ",
    });
  });
});

describe("composer history cycling invariant", () => {
  it("never loses the unsent draft: up then down round-trips to the exact original text", () => {
    const entries = ["newest message", "older message"];
    const originalDraft = "half-typed thought, not sent yet";

    const afterFirstUp = cycleComposerHistoryOlder(null, originalDraft, entries);
    const afterSecondUp = cycleComposerHistoryOlder(
      afterFirstUp?.nextState ?? null,
      originalDraft,
      entries,
    );
    const afterFirstDown = cycleComposerHistoryNewer(afterSecondUp?.nextState ?? null, entries);
    const afterSecondDown = cycleComposerHistoryNewer(afterFirstDown?.nextState ?? null, entries);

    expect(afterSecondDown).toEqual({ nextState: null, text: originalDraft });
  });
});

describe("resolveComposerHistoryArrowKey", () => {
  it("does not handle the key when the cursor is not at the relevant visual edge", () => {
    const resolution = resolveComposerHistoryArrowKey({
      direction: "up",
      atVisualEdge: false,
      entries: ["newest"],
      state: null,
      currentDraft: "typing something",
    });

    expect(resolution).toEqual({ handled: false, nextState: null });
  });

  it("does not handle the key when there is no history to cycle into", () => {
    const resolution = resolveComposerHistoryArrowKey({
      direction: "up",
      atVisualEdge: true,
      entries: [],
      state: null,
      currentDraft: "",
    });

    expect(resolution).toEqual({ handled: false, nextState: null });
  });

  it("handles ArrowUp at the top edge by stashing the draft and recalling the newest entry", () => {
    const resolution = resolveComposerHistoryArrowKey({
      direction: "up",
      atVisualEdge: true,
      entries: ["newest", "older"],
      state: null,
      currentDraft: "unsent draft",
    });

    expect(resolution).toEqual({
      handled: true,
      nextState: { stashedDraft: "unsent draft", index: 0 },
      nextText: "newest",
    });
  });

  it("handles ArrowDown at the bottom edge by restoring the stashed draft", () => {
    const resolution = resolveComposerHistoryArrowKey({
      direction: "down",
      atVisualEdge: true,
      entries: ["newest", "older"],
      state: { stashedDraft: "unsent draft", index: 0 },
      currentDraft: "newest",
    });

    expect(resolution).toEqual({
      handled: true,
      nextState: null,
      nextText: "unsent draft",
    });
  });
});

describe("parseStandaloneComposerSlashCommand", () => {
  it("parses standalone /plan command", () => {
    expect(parseStandaloneComposerSlashCommand(" /plan ")).toBe("plan");
  });

  it("parses standalone /default command", () => {
    expect(parseStandaloneComposerSlashCommand("/default")).toBe("default");
  });

  it("ignores slash commands with extra message text", () => {
    expect(parseStandaloneComposerSlashCommand("/plan explain this")).toBeNull();
  });
});
