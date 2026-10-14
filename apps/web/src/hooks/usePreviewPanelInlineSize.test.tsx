import type { ChatWidth } from "@t3tools/contracts/settings";
import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_REM_PIXELS } from "./previewPanelAutoWidth";
import { usePreviewPanelInlineSize } from "./usePreviewPanelInlineSize";

const WINDOW_WIDTH = 3_000;
const ROW_WIDTH = 2_304;
const WIDER_ROW_WIDTH = 2_504;
const LARGER_ROOT_FONT_SIZE = 20;
const DEFAULT_PANEL_WIDTH = 540;
const COMFORTABLE_WITHOUT_CARD_WIDTH = 1_472;
const COMFORTABLE_WITH_CARD_WIDTH = 1_196;
const WIDE_WITHOUT_CARD_WIDTH = 1_056;
const COMFORTABLE_WITHOUT_CARD_AT_LARGER_ROOT_FONT_SIZE_WIDTH = 1_288;
const COMFORTABLE_WITHOUT_CARD_IN_WIDER_ROW_WIDTH = 1_672;

const row = { clientWidth: ROW_WIDTH };
let rootFontSize = DEFAULT_REM_PIXELS;
let commitCount = 0;
let renderer: ReactTestRenderer;
let panelWidth = 0;
let frame: FrameRequestCallback | undefined;
let events: EventTarget;

function Probe({ chatWidth, gitCardShown }: { chatWidth?: ChatWidth; gitCardShown?: boolean }) {
  const { width } = usePreviewPanelInlineSize(undefined, {
    container: row as HTMLElement,
    autoWidth:
      chatWidth === undefined ? undefined : { chatWidth, gitCardShown: gitCardShown ?? false },
  });
  useLayoutEffect(() => {
    panelWidth = width;
    commitCount += 1;
  });
  return null;
}

async function resizeWindow() {
  await act(() => {
    events.dispatchEvent(new Event("resize"));
    frame?.(0);
    frame = undefined;
  });
}

beforeEach(() => {
  row.clientWidth = ROW_WIDTH;
  rootFontSize = DEFAULT_REM_PIXELS;
  commitCount = 0;
  frame = undefined;
  events = new EventTarget();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    innerWidth: WINDOW_WIDTH,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    },
    cancelAnimationFrame: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  vi.stubGlobal("document", { documentElement: {}, body: { style: {} } });
  vi.stubGlobal("getComputedStyle", () => ({ fontSize: `${rootFontSize}px` }));
});

afterEach(async () => {
  await act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

describe("usePreviewPanelInlineSize auto width", () => {
  it("keeps the default width for a panel without auto width options", async () => {
    await act(() => {
      renderer = create(<Probe />);
    });

    expect(panelWidth).toBe(DEFAULT_PANEL_WIDTH);
  });

  it("follows the chat width, the card toggle, the row and the root font size without extra commits", async () => {
    await act(() => {
      renderer = create(<Probe chatWidth="comfortable" />);
    });
    expect(panelWidth).toBe(COMFORTABLE_WITHOUT_CARD_WIDTH);

    await act(() => renderer.update(<Probe chatWidth="comfortable" gitCardShown />));
    expect(panelWidth).toBe(COMFORTABLE_WITH_CARD_WIDTH);

    await act(() => renderer.update(<Probe chatWidth="wide" />));
    expect(panelWidth).toBe(WIDE_WITHOUT_CARD_WIDTH);

    await act(() => renderer.update(<Probe chatWidth="comfortable" />));
    expect(panelWidth).toBe(COMFORTABLE_WITHOUT_CARD_WIDTH);

    const commitsBeforeUnchangedMeasure = commitCount;
    await resizeWindow();
    expect(commitCount).toBe(commitsBeforeUnchangedMeasure);

    row.clientWidth = WIDER_ROW_WIDTH;
    await resizeWindow();
    expect(panelWidth).toBe(COMFORTABLE_WITHOUT_CARD_IN_WIDER_ROW_WIDTH);

    row.clientWidth = ROW_WIDTH;
    rootFontSize = LARGER_ROOT_FONT_SIZE;
    await resizeWindow();
    expect(panelWidth).toBe(COMFORTABLE_WITHOUT_CARD_AT_LARGER_ROOT_FONT_SIZE_WIDTH);
  });
});
