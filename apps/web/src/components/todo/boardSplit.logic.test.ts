import { assert, describe, it } from "vite-plus/test";

import {
  BOARD_BODY_MIN_WIDTH,
  BOARD_SPLIT_MIN_CONTAINER_WIDTH,
  ISSUE_PANE_MIN_WIDTH,
  detailWidthBounds,
  resolveSplitMode,
} from "./boardSplit.logic";

describe("resolveSplitMode", () => {
  it("resolveSplitMode_NormalDrawerAcrossContainerWidths_SplitsOnlyWhenBothMinimumsFit", () => {
    assert.isAtLeast(BOARD_SPLIT_MIN_CONTAINER_WIDTH, BOARD_BODY_MIN_WIDTH + ISSUE_PANE_MIN_WIDTH);

    assert.equal(resolveSplitMode(0, "normal"), "stacked");
    assert.equal(resolveSplitMode(BOARD_SPLIT_MIN_CONTAINER_WIDTH - 1, "normal"), "stacked");
    assert.equal(resolveSplitMode(BOARD_SPLIT_MIN_CONTAINER_WIDTH, "normal"), "split");
    assert.equal(resolveSplitMode(1920, "normal"), "split");
  });

  it("resolveSplitMode_FullDrawer_StacksAtEveryWidth", () => {
    assert.equal(resolveSplitMode(0, "full"), "stacked");
    assert.equal(resolveSplitMode(BOARD_SPLIT_MIN_CONTAINER_WIDTH, "full"), "stacked");
    assert.equal(resolveSplitMode(1920, "full"), "stacked");
  });
});

describe("detailWidthBounds", () => {
  it("detailWidthBounds_SplitContainers_KeepPaneAtLeastMinAndBoardAtLeastMin", () => {
    const splitWidths = [BOARD_SPLIT_MIN_CONTAINER_WIDTH, 800, 1024.6, 1920];

    for (const containerWidth of splitWidths) {
      const bounds = detailWidthBounds(containerWidth);

      assert.equal(bounds.minWidth, ISSUE_PANE_MIN_WIDTH);
      assert.isAtLeast(bounds.maxWidth, bounds.minWidth);
      assert.isAtMost(bounds.maxWidth + BOARD_BODY_MIN_WIDTH, containerWidth);
    }
    assert.equal(detailWidthBounds(BOARD_SPLIT_MIN_CONTAINER_WIDTH).maxWidth, ISSUE_PANE_MIN_WIDTH);
    assert.equal(
      detailWidthBounds(BOARD_SPLIT_MIN_CONTAINER_WIDTH + 100).maxWidth,
      ISSUE_PANE_MIN_WIDTH + 100,
    );
    assert.isTrue(Number.isInteger(detailWidthBounds(1024.6).maxWidth));
  });

  it("detailWidthBounds_ContainerTooNarrowOrUnmeasured_ResolvesInversionToPaneMinimum", () => {
    for (const containerWidth of [0, 200, BOARD_SPLIT_MIN_CONTAINER_WIDTH - 1]) {
      const bounds = detailWidthBounds(containerWidth);

      assert.deepEqual(bounds, { minWidth: ISSUE_PANE_MIN_WIDTH, maxWidth: ISSUE_PANE_MIN_WIDTH });
    }
  });
});
