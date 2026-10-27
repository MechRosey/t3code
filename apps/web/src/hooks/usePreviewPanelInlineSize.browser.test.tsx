import type { ChatWidth } from "@t3tools/contracts/settings";
import { act, type ReactElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
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

let root: Root;
let container: HTMLDivElement;
let row: HTMLDivElement;
let commitCount = 0;
let frame: FrameRequestCallback | undefined;

function Probe({ chatWidth, gitCardShown }: { chatWidth?: ChatWidth; gitCardShown?: boolean }) {
  const { width, observeRow } = usePreviewPanelInlineSize({
    container: row,
    autoWidth:
      chatWidth === undefined ? undefined : { chatWidth, gitCardShown: gitCardShown ?? false },
  });
  useLayoutEffect(() => {
    commitCount += 1;
  });
  return <output ref={(host) => (host === null ? undefined : observeRow(host))}>{width}</output>;
}

const panelWidth = () => Number(container.querySelector("output")!.textContent);

function setRowWidth(width: number) {
  row.style.width = `${width}px`;
}

function setRootFontSize(pixels: number) {
  document.documentElement.style.fontSize = `${pixels}px`;
}

async function render(element: ReactElement) {
  await act(() => root.render(element));
}

async function resizeWindow() {
  await act(() => {
    window.dispatchEvent(new Event("resize"));
    frame?.(0);
    frame = undefined;
  });
}

beforeEach(() => {
  commitCount = 0;
  frame = undefined;
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", undefined);
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(WINDOW_WIDTH);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  setRootFontSize(DEFAULT_REM_PIXELS);
  row = document.createElement("div");
  setRowWidth(ROW_WIDTH);
  container = document.createElement("div");
  document.body.append(row, container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  row.remove();
  document.documentElement.style.fontSize = "";
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("usePreviewPanelInlineSize auto width", () => {
  it("keeps the default width for a panel without auto width options", async () => {
    await render(<Probe />);

    expect(panelWidth()).toBe(DEFAULT_PANEL_WIDTH);
  });

  it("follows the chat width, the card toggle, the row and the root font size without extra commits", async () => {
    await render(<Probe chatWidth="comfortable" />);
    expect(panelWidth()).toBe(COMFORTABLE_WITHOUT_CARD_WIDTH);

    await render(<Probe chatWidth="comfortable" gitCardShown />);
    expect(panelWidth()).toBe(COMFORTABLE_WITH_CARD_WIDTH);

    await render(<Probe chatWidth="wide" />);
    expect(panelWidth()).toBe(WIDE_WITHOUT_CARD_WIDTH);

    await render(<Probe chatWidth="comfortable" />);
    expect(panelWidth()).toBe(COMFORTABLE_WITHOUT_CARD_WIDTH);

    const commitsBeforeUnchangedMeasure = commitCount;
    await resizeWindow();
    expect(commitCount).toBe(commitsBeforeUnchangedMeasure);

    setRowWidth(WIDER_ROW_WIDTH);
    await resizeWindow();
    expect(panelWidth()).toBe(COMFORTABLE_WITHOUT_CARD_IN_WIDER_ROW_WIDTH);

    setRowWidth(ROW_WIDTH);
    setRootFontSize(LARGER_ROOT_FONT_SIZE);
    await resizeWindow();
    expect(panelWidth()).toBe(COMFORTABLE_WITHOUT_CARD_AT_LARGER_ROOT_FONT_SIZE_WIDTH);
  });
});
