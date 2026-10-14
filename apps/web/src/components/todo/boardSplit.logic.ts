import type { BoardDrawerMode } from "./boardUiState";

export type BoardSplitMode = "split" | "stacked";

export const BOARD_BODY_MIN_WIDTH = 240;
export const ISSUE_PANE_MIN_WIDTH = 320;
const BOARD_EDGE_GUTTER_WIDTH = 8;

export const BOARD_SPLIT_MIN_CONTAINER_WIDTH =
  BOARD_BODY_MIN_WIDTH + ISSUE_PANE_MIN_WIDTH + BOARD_EDGE_GUTTER_WIDTH;

export function resolveSplitMode(
  containerWidth: number,
  drawerMode: BoardDrawerMode,
): BoardSplitMode {
  if (drawerMode === "full") return "stacked";
  return containerWidth >= BOARD_SPLIT_MIN_CONTAINER_WIDTH ? "split" : "stacked";
}

export function detailWidthBounds(containerWidth: number): {
  readonly minWidth: number;
  readonly maxWidth: number;
} {
  const roomBesideBoard =
    Math.floor(containerWidth) - BOARD_BODY_MIN_WIDTH - BOARD_EDGE_GUTTER_WIDTH;
  return {
    minWidth: ISSUE_PANE_MIN_WIDTH,
    maxWidth: Math.max(ISSUE_PANE_MIN_WIDTH, roomBesideBoard),
  };
}
