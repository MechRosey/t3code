import { splitPromptIntoComposerSegments } from "./composer-editor-mentions";
import { INLINE_TERMINAL_CONTEXT_PLACEHOLDER } from "./lib/terminalContext";

export type ComposerTriggerKind = "path" | "slash-command" | "skill";
export type ComposerSlashCommand = "model" | "plan" | "default";

export interface ComposerTrigger {
  kind: ComposerTriggerKind;
  query: string;
  rangeStart: number;
  rangeEnd: number;
}

export function shouldSubmitComposerOnEnter(input: {
  isMobileViewport: boolean;
  shiftKey: boolean;
}): boolean {
  return !input.isMobileViewport && !input.shiftKey;
}

const isInlineTokenSegment = (
  segment:
    | { type: "text"; text: string }
    | { type: "mention" }
    | { type: "skill" }
    | { type: "terminal-context" },
): boolean => segment.type !== "text";

function clampCursor(text: string, cursor: number): number {
  if (!Number.isFinite(cursor)) return text.length;
  return Math.max(0, Math.min(text.length, Math.floor(cursor)));
}

function isWhitespace(char: string): boolean {
  return (
    char === " " ||
    char === "\n" ||
    char === "\t" ||
    char === "\r" ||
    char === INLINE_TERMINAL_CONTEXT_PLACEHOLDER
  );
}

function tokenStartForCursor(text: string, cursor: number): number {
  let index = cursor - 1;
  while (index >= 0 && !isWhitespace(text[index] ?? "")) {
    index -= 1;
  }
  return index + 1;
}

export function expandCollapsedComposerCursor(text: string, cursorInput: number): number {
  const collapsedCursor = clampCursor(text, cursorInput);
  const segments = splitPromptIntoComposerSegments(text);
  if (segments.length === 0) {
    return collapsedCursor;
  }

  let remaining = collapsedCursor;
  let expandedCursor = 0;

  for (const segment of segments) {
    if (segment.type === "mention") {
      const expandedLength = segment.source.length;
      if (remaining <= 1) {
        return expandedCursor + (remaining === 0 ? 0 : expandedLength);
      }
      remaining -= 1;
      expandedCursor += expandedLength;
      continue;
    }
    if (segment.type === "skill") {
      const expandedLength = segment.name.length + 1;
      if (remaining <= 1) {
        return expandedCursor + (remaining === 0 ? 0 : expandedLength);
      }
      remaining -= 1;
      expandedCursor += expandedLength;
      continue;
    }
    if (segment.type === "terminal-context") {
      if (remaining <= 1) {
        return expandedCursor + remaining;
      }
      remaining -= 1;
      expandedCursor += 1;
      continue;
    }

    const segmentLength = segment.text.length;
    if (remaining <= segmentLength) {
      return expandedCursor + remaining;
    }
    remaining -= segmentLength;
    expandedCursor += segmentLength;
  }

  return expandedCursor;
}

function collapsedSegmentLength(
  segment:
    | { type: "text"; text: string }
    | { type: "mention" }
    | { type: "skill" }
    | { type: "terminal-context" },
): number {
  if (segment.type === "text") {
    return segment.text.length;
  }
  return 1;
}

function clampCollapsedComposerCursorForSegments(
  segments: ReadonlyArray<
    | { type: "text"; text: string }
    | { type: "mention" }
    | { type: "skill" }
    | { type: "terminal-context" }
  >,
  cursorInput: number,
): number {
  const collapsedLength = segments.reduce(
    (total, segment) => total + collapsedSegmentLength(segment),
    0,
  );
  if (!Number.isFinite(cursorInput)) {
    return collapsedLength;
  }
  return Math.max(0, Math.min(collapsedLength, Math.floor(cursorInput)));
}

export function clampCollapsedComposerCursor(text: string, cursorInput: number): number {
  return clampCollapsedComposerCursorForSegments(
    splitPromptIntoComposerSegments(text),
    cursorInput,
  );
}

export function collapseExpandedComposerCursor(text: string, cursorInput: number): number {
  const expandedCursor = clampCursor(text, cursorInput);
  const segments = splitPromptIntoComposerSegments(text);
  if (segments.length === 0) {
    return expandedCursor;
  }

  let remaining = expandedCursor;
  let collapsedCursor = 0;

  for (const segment of segments) {
    if (segment.type === "mention") {
      const expandedLength = segment.source.length;
      if (remaining === 0) {
        return collapsedCursor;
      }
      if (remaining <= expandedLength) {
        return collapsedCursor + 1;
      }
      remaining -= expandedLength;
      collapsedCursor += 1;
      continue;
    }
    if (segment.type === "skill") {
      const expandedLength = segment.name.length + 1;
      if (remaining === 0) {
        return collapsedCursor;
      }
      if (remaining <= expandedLength) {
        return collapsedCursor + 1;
      }
      remaining -= expandedLength;
      collapsedCursor += 1;
      continue;
    }
    if (segment.type === "terminal-context") {
      if (remaining <= 1) {
        return collapsedCursor + remaining;
      }
      remaining -= 1;
      collapsedCursor += 1;
      continue;
    }

    const segmentLength = segment.text.length;
    if (remaining <= segmentLength) {
      return collapsedCursor + remaining;
    }
    remaining -= segmentLength;
    collapsedCursor += segmentLength;
  }

  return collapsedCursor;
}

export function isCollapsedCursorAdjacentToInlineToken(
  text: string,
  cursorInput: number,
  direction: "left" | "right",
): boolean {
  const segments = splitPromptIntoComposerSegments(text);
  if (!segments.some(isInlineTokenSegment)) {
    return false;
  }

  const cursor = clampCollapsedComposerCursorForSegments(segments, cursorInput);
  let collapsedOffset = 0;

  for (const segment of segments) {
    if (isInlineTokenSegment(segment)) {
      if (direction === "left" && cursor === collapsedOffset + 1) {
        return true;
      }
      if (direction === "right" && cursor === collapsedOffset) {
        return true;
      }
    }
    collapsedOffset += collapsedSegmentLength(segment);
  }

  return false;
}

export const isCollapsedCursorAdjacentToMention = isCollapsedCursorAdjacentToInlineToken;

export function detectComposerTrigger(text: string, cursorInput: number): ComposerTrigger | null {
  const cursor = clampCursor(text, cursorInput);
  const lineStart = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const linePrefix = text.slice(lineStart, cursor);

  if (linePrefix.startsWith("/")) {
    const commandMatch = /^\/(\S*)$/.exec(linePrefix);
    if (commandMatch) {
      const commandQuery = commandMatch[1] ?? "";
      return {
        kind: "slash-command",
        query: commandQuery,
        rangeStart: lineStart,
        rangeEnd: cursor,
      };
    }
  }

  const tokenStart = tokenStartForCursor(text, cursor);
  const token = text.slice(tokenStart, cursor);
  if (token.startsWith("$")) {
    return {
      kind: "skill",
      query: token.slice(1),
      rangeStart: tokenStart,
      rangeEnd: cursor,
    };
  }
  if (!token.startsWith("@")) {
    return null;
  }

  return {
    kind: "path",
    query: token.slice(1),
    rangeStart: tokenStart,
    rangeEnd: cursor,
  };
}

export function parseStandaloneComposerSlashCommand(
  text: string,
): Exclude<ComposerSlashCommand, "model"> | null {
  const match = /^\/(plan|default)\s*$/i.exec(text.trim());
  if (!match) {
    return null;
  }
  const command = match[1]?.toLowerCase();
  if (command === "plan") return "plan";
  return "default";
}

export function replaceTextRange(
  text: string,
  rangeStart: number,
  rangeEnd: number,
  replacement: string,
): { text: string; cursor: number } {
  const safeStart = Math.max(0, Math.min(text.length, rangeStart));
  const safeEnd = Math.max(safeStart, Math.min(text.length, rangeEnd));
  const nextText = `${text.slice(0, safeStart)}${replacement}${text.slice(safeEnd)}`;
  return { text: nextText, cursor: safeStart + replacement.length };
}

const COMPOSER_HISTORY_IMAGE_PLACEHOLDER = "[image removed]";

export interface ComposerHistorySourceMessage {
  readonly role: "user" | "assistant" | "system";
  readonly text: string;
  readonly attachments?: ReadonlyArray<{ readonly type: string }> | undefined;
}

function composerHistoryEntryText(message: ComposerHistorySourceMessage): string {
  const imageAttachmentCount = (message.attachments ?? []).filter(
    (attachment) => attachment.type === "image",
  ).length;
  if (imageAttachmentCount === 0) {
    return message.text;
  }
  const placeholders = Array.from(
    { length: imageAttachmentCount },
    () => COMPOSER_HISTORY_IMAGE_PLACEHOLDER,
  );
  return message.text.length > 0
    ? [message.text, ...placeholders].join("\n")
    : placeholders.join("\n");
}

/** Own messages only, most-recent-first, with image attachments rendered as inline placeholders. */
export function buildComposerHistoryEntries(
  messages: ReadonlyArray<ComposerHistorySourceMessage>,
): string[] {
  return messages
    .filter((message) => message.role === "user")
    .toReversed()
    .map(composerHistoryEntryText);
}

export interface ComposerHistoryCycleState {
  readonly stashedDraft: string;
  readonly index: number;
  /** Snapshotted when the session starts; stays fixed even if the live history changes shape mid-cycle. */
  readonly entries: ReadonlyArray<string>;
}

export interface ComposerHistoryCycleStep {
  readonly nextState: ComposerHistoryCycleState | null;
  readonly text: string;
}

/**
 * One step further back in history (Up). Stashes the current draft and
 * snapshots `entries` on the first call, so the rest of the session is
 * immune to the live entries array changing shape. Returns null when there
 * is nowhere further back to go, so the caller can tell "no-op" apart from
 * "stayed at the same entry".
 */
export function cycleComposerHistoryOlder(
  state: ComposerHistoryCycleState | null,
  currentDraft: string,
  entries: ReadonlyArray<string>,
): ComposerHistoryCycleStep | null {
  if (state === null) {
    if (entries.length === 0) {
      return null;
    }
    return { nextState: { stashedDraft: currentDraft, index: 0, entries }, text: entries[0]! };
  }
  const nextIndex = state.index + 1;
  if (nextIndex >= state.entries.length) {
    return null;
  }
  return {
    nextState: { stashedDraft: state.stashedDraft, index: nextIndex, entries: state.entries },
    text: state.entries[nextIndex]!,
  };
}

/**
 * One step toward the present (Down). Once index 0 is passed, restores the
 * exact stashed draft and stops cycling (state becomes null). Reads the
 * entries snapshotted in `state`; there is no live entries array to fall out
 * of sync with.
 */
export function cycleComposerHistoryNewer(
  state: ComposerHistoryCycleState | null,
): ComposerHistoryCycleStep | null {
  if (state === null) {
    return null;
  }
  if (state.index === 0) {
    return { nextState: null, text: state.stashedDraft };
  }
  const nextIndex = state.index - 1;
  return {
    nextState: { stashedDraft: state.stashedDraft, index: nextIndex, entries: state.entries },
    text: state.entries[nextIndex] ?? state.stashedDraft,
  };
}

export interface ComposerHistoryArrowKeyResolution {
  readonly handled: boolean;
  readonly nextState: ComposerHistoryCycleState | null;
  readonly nextText?: string;
}

/**
 * Decides what an Up/Down press should do to composer history, given whether
 * the cursor sits at the relevant visual edge (top for up, bottom for down)
 * of the input. Keeping the edge check as a boolean input keeps this testable
 * without a real layout engine - the caller supplies it from DOM geometry.
 * `entries` is only consulted to start a new session; once `state` is
 * non-null, the snapshot it carries is authoritative.
 */
export function resolveComposerHistoryArrowKey(input: {
  direction: "up" | "down";
  atVisualEdge: boolean;
  entries: ReadonlyArray<string>;
  state: ComposerHistoryCycleState | null;
  currentDraft: string;
}): ComposerHistoryArrowKeyResolution {
  if (!input.atVisualEdge) {
    return { handled: false, nextState: input.state };
  }
  const step =
    input.direction === "up"
      ? cycleComposerHistoryOlder(input.state, input.currentDraft, input.entries)
      : cycleComposerHistoryNewer(input.state);
  if (!step) {
    return { handled: false, nextState: input.state };
  }
  return { handled: true, nextState: step.nextState, nextText: step.text };
}
