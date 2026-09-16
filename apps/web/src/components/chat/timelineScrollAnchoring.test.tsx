import { describe, expect, it } from "vite-plus/test";
import {
  getAnchoredTurnMetrics,
  getInitialAnchorScrollTarget,
  getRowBottom,
  timelineContentOverflowsViewport,
} from "./timelineScrollAnchoring";

function buildState({
  positions,
  sizes,
  scroll = 0,
  scrollLength = 700,
}: {
  readonly positions: readonly number[];
  readonly sizes: readonly number[];
  readonly scroll?: number;
  readonly scrollLength?: number;
}) {
  return {
    data: positions.map((_, index) => index),
    scroll,
    scrollLength,
    positionAtIndex: (index: number) => positions[index],
    sizeAtIndex: (index: number) => sizes[index],
  };
}

describe("timelineContentOverflowsViewport", () => {
  const inset = { composerInset: 100, anchorOffset: 24 };

  it("reports overflow from the last row, not the inset spacer", () => {
    const fits = buildState({ positions: [0, 200], sizes: [200, 300], scrollLength: 700 });
    expect(timelineContentOverflowsViewport(fits, inset)).toBe(false);

    const overflows = buildState({ positions: [0, 200], sizes: [200, 400], scrollLength: 700 });
    expect(timelineContentOverflowsViewport(overflows, inset)).toBe(true);
  });

  it("treats an empty or unmeasured list as fitting", () => {
    expect(timelineContentOverflowsViewport(undefined, inset)).toBe(false);
    expect(
      timelineContentOverflowsViewport(
        buildState({ positions: [0, 200], sizes: [200, 400], scrollLength: 0 }),
        inset,
      ),
    ).toBe(false);
    expect(timelineContentOverflowsViewport(buildState({ positions: [], sizes: [] }), inset)).toBe(
      false,
    );
    expect(
      timelineContentOverflowsViewport(
        buildState({ positions: [0, 200], sizes: [200, Number.NaN] }),
        inset,
      ),
    ).toBe(false);
  });
});

describe("timeline scroll anchoring", () => {
  it("measures row bottoms from LegendList row position and size", () => {
    const state = buildState({
      positions: [0, 120],
      sizes: [80, 40],
    });

    expect(getRowBottom(state, 1)).toBe(160);
  });

  it("treats the active turn as fitting when it fits above the composer", () => {
    const state = buildState({
      positions: [0, 300, 460],
      sizes: [240, 80, 140],
      scrollLength: 760,
    });

    const metrics = getAnchoredTurnMetrics({
      state,
      anchorIndex: 1,
      composerOverlayHeight: 180,
      anchorOffset: 16,
    });

    expect(metrics?.turnHeight).toBe(300);
    expect(metrics?.usableViewportHeight).toBe(564);
    expect(metrics?.overflowsUsableViewport).toBe(false);
    expect(metrics?.targetScrollToRevealEnd).toBe(36);
    expect(metrics?.scrollDeltaToRevealEnd).toBe(36);
  });

  it("targets the real row end instead of any temporary reserved tail", () => {
    const state = buildState({
      positions: [0, 1720, 1880],
      sizes: [1600, 80, 120],
      scroll: 1900,
      scrollLength: 760,
    });

    const metrics = getAnchoredTurnMetrics({
      state,
      anchorIndex: 1,
      composerOverlayHeight: 180,
      anchorOffset: 16,
    });

    expect(metrics?.lastBottom).toBe(2000);
    expect(metrics?.targetScrollToRevealEnd).toBe(1436);
    expect(metrics?.scrollDeltaToRevealEnd).toBe(0);
  });

  it("reports overflow only for the current anchored turn", () => {
    const state = buildState({
      positions: [0, 900, 1180],
      sizes: [800, 220, 300],
      scroll: 900,
      scrollLength: 760,
    });

    const metrics = getAnchoredTurnMetrics({
      state,
      anchorIndex: 1,
      composerOverlayHeight: 180,
      anchorOffset: 16,
    });

    expect(metrics?.turnHeight).toBe(580);
    expect(metrics?.usableViewportHeight).toBe(564);
    expect(metrics?.overflowsUsableViewport).toBe(true);
  });

  it("returns the minimal positive scroll delta needed to reveal the turn end", () => {
    const state = buildState({
      positions: [0, 900, 1180],
      sizes: [800, 220, 360],
      scroll: 900,
      scrollLength: 760,
    });

    const metrics = getAnchoredTurnMetrics({
      state,
      anchorIndex: 1,
      composerOverlayHeight: 180,
      anchorOffset: 16,
    });

    expect(metrics?.lastBottom).toBe(1540);
    expect(metrics?.visibleUsableBottom).toBe(1464);
    expect(metrics?.scrollDeltaToRevealEnd).toBe(76);
  });

  it("subtracts composer height from usable viewport height", () => {
    const state = buildState({
      positions: [0, 300],
      sizes: [120, 470],
      scrollLength: 700,
    });

    const withoutComposer = getAnchoredTurnMetrics({
      state,
      anchorIndex: 1,
      composerOverlayHeight: 0,
      anchorOffset: 16,
    });
    const withComposer = getAnchoredTurnMetrics({
      state,
      anchorIndex: 1,
      composerOverlayHeight: 220,
      anchorOffset: 16,
    });

    expect(withoutComposer?.overflowsUsableViewport).toBe(false);
    expect(withComposer?.overflowsUsableViewport).toBe(true);
  });
});

describe("initial anchor scroll target", () => {
  it("keeps a minimum slice of the previous message's tail above the new message", () => {
    const state = buildState({
      // Row 0 is the previous reply, row 1 is the newly sent message.
      positions: [0, 400],
      sizes: [400, 60],
      scrollLength: 700,
    });
    const anchorIndex = 1;
    const previousRowBottom = getRowBottom(state, anchorIndex - 1) ?? undefined;
    const anchorRowTop = state.positionAtIndex(anchorIndex);
    const anchorRowBottom = getRowBottom(state, anchorIndex) ?? undefined;

    const target = getInitialAnchorScrollTarget({
      previousRowBottom,
      anchorRowTop: anchorRowTop!,
      anchorRowBottom,
      viewportHeight: state.scrollLength,
      minimumPriorContextPx: 96,
    });

    expect(target?.revealedPriorContextPx).toBe(96);
    expect(target?.scrollTarget).toBe(400 - 96);
  });

  it("returns null when there is no previous row, so the caller can fall back to top-anchoring", () => {
    const state = buildState({
      positions: [0],
      sizes: [60],
      scrollLength: 700,
    });
    const anchorIndex = 0;
    const previousRowBottom = getRowBottom(state, anchorIndex - 1) ?? undefined;
    const anchorRowTop = state.positionAtIndex(anchorIndex);

    const target = getInitialAnchorScrollTarget({
      previousRowBottom,
      anchorRowTop: anchorRowTop!,
      anchorRowBottom: getRowBottom(state, anchorIndex) ?? undefined,
      viewportHeight: state.scrollLength,
      minimumPriorContextPx: 96,
    });

    expect(target).toBeNull();
  });

  it("returns null when the previous row has not been measured yet", () => {
    const target = getInitialAnchorScrollTarget({
      previousRowBottom: undefined,
      anchorRowTop: 400,
      anchorRowBottom: 460,
      viewportHeight: 700,
      minimumPriorContextPx: 96,
    });

    expect(target).toBeNull();
  });

  it("shows as much of the previous tail as fits when the new message leaves little room", () => {
    const state = buildState({
      // The previous reply is long; the new message itself is tall enough
      // that giving it the full minimum prior context would push its own
      // bottom past the usable viewport.
      positions: [0, 2000],
      sizes: [2000, 650],
      scrollLength: 700,
    });
    const anchorIndex = 1;
    const previousRowBottom = getRowBottom(state, anchorIndex - 1) ?? undefined;
    const anchorRowTop = state.positionAtIndex(anchorIndex);
    const anchorRowBottom = getRowBottom(state, anchorIndex) ?? undefined;

    const target = getInitialAnchorScrollTarget({
      previousRowBottom,
      anchorRowTop: anchorRowTop!,
      anchorRowBottom,
      viewportHeight: state.scrollLength,
      minimumPriorContextPx: 96,
    });

    // Only 50px of room is left once the 650px-tall new message reserves its
    // own space in the 700px viewport, so the reveal is capped there instead
    // of the requested 96px.
    expect(target?.revealedPriorContextPx).toBe(50);
    expect(target?.scrollTarget).toBe(2000 - 50);
  });

  it("clamps the reveal to what exists above when the previous row sits near the start of the thread", () => {
    const state = buildState({
      positions: [0, 40],
      sizes: [40, 60],
      scrollLength: 700,
    });
    const anchorIndex = 1;
    const previousRowBottom = getRowBottom(state, anchorIndex - 1) ?? undefined;
    const anchorRowTop = state.positionAtIndex(anchorIndex);
    const anchorRowBottom = getRowBottom(state, anchorIndex) ?? undefined;

    const target = getInitialAnchorScrollTarget({
      previousRowBottom,
      anchorRowTop: anchorRowTop!,
      anchorRowBottom,
      viewportHeight: state.scrollLength,
      minimumPriorContextPx: 96,
    });

    expect(target?.scrollTarget).toBe(0);
    expect(target?.revealedPriorContextPx).toBe(40);
  });
});
