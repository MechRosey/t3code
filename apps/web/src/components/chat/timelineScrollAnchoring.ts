// Match the titlebar fade inset so draft promotion preserves the first row's position.
export const CHAT_TIMELINE_ANCHOR_OFFSET = 24;

export type TimelineScrollMode = "following-end" | "anchoring-new-turn" | "free-scrolling";

export interface TimelineListMeasurementState {
  readonly data: readonly unknown[];
  readonly scroll: number;
  readonly scrollLength: number;
  readonly positionAtIndex: (index: number) => number | undefined;
  readonly sizeAtIndex: (index: number) => number | undefined;
}

export interface AnchoredTurnMetrics {
  readonly anchorTop: number;
  readonly lastBottom: number;
  readonly turnHeight: number;
  readonly usableViewportHeight: number;
  readonly visibleUsableBottom: number;
  readonly overflowsUsableViewport: boolean;
  readonly targetScrollToRevealEnd: number;
  readonly scrollDeltaToRevealEnd: number;
}

export interface InitialAnchorScrollTarget {
  readonly scrollTarget: number;
  readonly revealedPriorContextPx: number;
}

/**
 * Where to land the viewport when a newly sent turn is first anchored.
 *
 * Invariant: once settled, the new message row is visible and at least
 * `minimumPriorContextPx` of the previous row's tail is visible above it -
 * unless there is no previous row (or it hasn't been measured yet, both
 * signalled by an undefined `previousRowBottom`), in which case this
 * returns null so the caller can fall back to top-anchoring the new row.
 * When honoring the full minimum would push the new row's own bottom past
 * `viewportHeight`, the reveal shrinks to whatever room is left, and the
 * new row is prioritized. Near the start of a thread, where less than
 * `minimumPriorContextPx` of prior content exists at all, the reveal
 * shrinks to whatever exists.
 */
export function getInitialAnchorScrollTarget({
  previousRowBottom,
  anchorRowTop,
  anchorRowBottom,
  viewportHeight,
  minimumPriorContextPx,
}: {
  readonly previousRowBottom: number | undefined;
  readonly anchorRowTop: number;
  readonly anchorRowBottom: number | undefined;
  readonly viewportHeight: number;
  readonly minimumPriorContextPx: number;
}): InitialAnchorScrollTarget | null {
  if (
    typeof previousRowBottom !== "number" ||
    !Number.isFinite(previousRowBottom) ||
    previousRowBottom > anchorRowTop
  ) {
    return null;
  }

  const anchorRowHeight =
    typeof anchorRowBottom === "number" && Number.isFinite(anchorRowBottom)
      ? Math.max(0, anchorRowBottom - anchorRowTop)
      : 0;
  const roomForPriorContext = Math.max(0, viewportHeight - anchorRowHeight);
  const revealTarget = Math.max(0, Math.min(minimumPriorContextPx, roomForPriorContext));
  const scrollTarget = Math.max(0, previousRowBottom - revealTarget);

  return {
    scrollTarget,
    revealedPriorContextPx: previousRowBottom - scrollTarget,
  };
}

export function getRowBottom(state: TimelineListMeasurementState, index: number): number | null {
  const top = state.positionAtIndex(index);
  const height = state.sizeAtIndex(index);
  if (
    typeof top !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(top) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  return top + Math.max(1, height);
}

/**
 * Whether the timeline's real rows extend past the viewport left above the
 * composer. The list's own content length includes the composer inset
 * spacer, so this measures from the last row instead. Unknown row geometry
 * or an unmeasured viewport counts as fitting.
 */
export function timelineContentOverflowsViewport(
  state: TimelineListMeasurementState | undefined,
  input: { readonly composerInset: number; readonly anchorOffset: number },
): boolean {
  if (!state || !state.data || state.data.length === 0) {
    return false;
  }
  const scrollLength = state.scrollLength;
  if (typeof scrollLength !== "number" || !Number.isFinite(scrollLength) || scrollLength <= 0) {
    return false;
  }
  const lastBottom = getRowBottom(state, state.data.length - 1);
  if (lastBottom === null) {
    return false;
  }
  const visibleScrollLength = Math.max(0, scrollLength - input.composerInset - input.anchorOffset);
  return lastBottom > visibleScrollLength;
}

export function getAnchoredTurnMetrics({
  state,
  anchorIndex,
  composerOverlayHeight,
  anchorOffset,
}: {
  readonly state: TimelineListMeasurementState;
  readonly anchorIndex: number;
  readonly composerOverlayHeight: number;
  readonly anchorOffset: number;
}): AnchoredTurnMetrics | null {
  if (state.data.length === 0) {
    return null;
  }

  const boundedAnchorIndex = Math.max(0, Math.min(anchorIndex, state.data.length - 1));
  const anchorTop = state.positionAtIndex(boundedAnchorIndex);
  const lastBottom = getRowBottom(state, state.data.length - 1);
  if (typeof anchorTop !== "number" || !Number.isFinite(anchorTop) || lastBottom === null) {
    return null;
  }

  const usableViewportHeight = Math.max(
    0,
    state.scrollLength - composerOverlayHeight - anchorOffset,
  );
  const turnHeight = Math.max(0, lastBottom - anchorTop);
  const visibleUsableBottom = state.scroll + usableViewportHeight;
  const targetScrollToRevealEnd = Math.max(0, lastBottom - usableViewportHeight);
  const scrollDeltaToRevealEnd = Math.max(0, targetScrollToRevealEnd - state.scroll);

  return {
    anchorTop,
    lastBottom,
    turnHeight,
    usableViewportHeight,
    visibleUsableBottom,
    overflowsUsableViewport: turnHeight > usableViewportHeight,
    targetScrollToRevealEnd,
    scrollDeltaToRevealEnd,
  };
}
