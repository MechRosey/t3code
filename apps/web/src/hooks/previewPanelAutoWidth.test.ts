import type { ChatWidth } from "@t3tools/contracts/settings";
import { describe, expect, it } from "vite-plus/test";

import { resolveAutoPreviewPanelWidth } from "./previewPanelAutoWidth";
import { getPreviewPanelMaxWidth } from "./usePreviewPanelInlineSize";

const MIN_WIDTH = 360;
const DEFAULT_WIDTH = 540;
const SIDEBAR_WIDTH = 256;
const COMFORTABLE_CAP_WITH_CARD = 1_108;
const COMFORTABLE_CAP_WITHOUT_CARD = 832;

function panelWidthForWindow(windowWidth: number, chatWidth: ChatWidth, gitCardShown: boolean) {
  const rowWidth = windowWidth - SIDEBAR_WIDTH;
  return resolveAutoPreviewPanelWidth({
    rowWidth,
    chatWidth,
    gitCardShown,
    minWidth: MIN_WIDTH,
    defaultWidth: DEFAULT_WIDTH,
    maxWidth: getPreviewPanelMaxWidth(windowWidth, rowWidth),
  });
}

describe("resolveAutoPreviewPanelWidth", () => {
  it.each([
    [2_560, "comfortable", true, 1_196],
    [2_200, "comfortable", true, 836],
    [1_900, "comfortable", true, 539],
    [1_600, "comfortable", true, 440],
    [1_300, "comfortable", true, 360],
    [981, "comfortable", true, 360],
    [2_560, "comfortable", false, 1_472],
    [2_200, "comfortable", false, 1_112],
    [1_900, "comfortable", false, 812],
    [1_600, "comfortable", false, 529],
    [1_300, "comfortable", false, 411],
    [2_560, "wide", true, 780],
    [2_200, "wide", true, 509],
    [1_900, "wide", true, 430],
    [1_600, "wide", true, 360],
    [2_560, "wide", false, 1_056],
    [2_200, "wide", false, 696],
    [1_900, "wide", false, 497],
    [1_600, "wide", false, 406],
    [2_560, "full", true, 755],
    [2_200, "full", true, 637],
    [1_900, "full", true, 539],
    [2_560, "full", false, 907],
    [2_200, "full", false, 765],
    [1_900, "full", false, 647],
    [1_600, "full", false, 529],
  ] as const)(
    "window %i, %s chat, card shown %s gives a %i px panel",
    (windowWidth, chatWidth, gitCardShown, expected) => {
      expect(panelWidthForWindow(windowWidth, chatWidth, gitCardShown)).toBe(expected);
    },
  );

  it("gives the panel everything beyond the conversation cap while the cap leaves the default width", () => {
    for (const [gitCardShown, cap] of [
      [true, COMFORTABLE_CAP_WITH_CARD],
      [false, COMFORTABLE_CAP_WITHOUT_CARD],
    ] as const) {
      for (let rowWidth = cap + DEFAULT_WIDTH; rowWidth <= 3_000; rowWidth += 37) {
        const panel = resolveAutoPreviewPanelWidth({
          rowWidth,
          chatWidth: "comfortable",
          gitCardShown,
          minWidth: MIN_WIDTH,
          defaultWidth: DEFAULT_WIDTH,
          maxWidth: Number.MAX_SAFE_INTEGER,
        });

        expect(rowWidth - panel).toBeLessThanOrEqual(cap);
        expect(panel).toBe(rowWidth - cap);
      }
    }
  });

  it("is continuous at the cap boundary", () => {
    const widthAt = (rowWidth: number) =>
      resolveAutoPreviewPanelWidth({
        rowWidth,
        chatWidth: "comfortable",
        gitCardShown: true,
        minWidth: MIN_WIDTH,
        defaultWidth: DEFAULT_WIDTH,
        maxWidth: Number.MAX_SAFE_INTEGER,
      });
    const boundary = COMFORTABLE_CAP_WITH_CARD + DEFAULT_WIDTH;

    expect(widthAt(boundary)).toBe(DEFAULT_WIDTH);
    expect(Math.abs(widthAt(boundary - 1) - widthAt(boundary))).toBeLessThanOrEqual(1);
  });

  it("clamps to the maximum panel width", () => {
    const panel = resolveAutoPreviewPanelWidth({
      rowWidth: 2_304,
      chatWidth: "comfortable",
      gitCardShown: false,
      minWidth: MIN_WIDTH,
      defaultWidth: DEFAULT_WIDTH,
      maxWidth: 1_000,
    });

    expect(panel).toBe(1_000);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to the default width for a %s px row",
    (rowWidth) => {
      const panel = resolveAutoPreviewPanelWidth({
        rowWidth,
        chatWidth: "comfortable",
        gitCardShown: true,
        minWidth: MIN_WIDTH,
        defaultWidth: DEFAULT_WIDTH,
        maxWidth: 1_000,
      });

      expect(panel).toBe(DEFAULT_WIDTH);
    },
  );
});
