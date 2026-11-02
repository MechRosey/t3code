import type { ChatWidth } from "@t3tools/contracts/settings";
import { useLayoutEffect } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render, stubGlobal } from "../../test/render";
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

interface ProbeProps {
  readonly chatWidth?: ChatWidth;
  readonly gitCardShown?: boolean;
}

function Probe({
  row,
  onCommit,
  chatWidth,
  gitCardShown,
}: ProbeProps & { readonly row: HTMLElement; readonly onCommit: () => void }) {
  const { width, observeRow } = usePreviewPanelInlineSize({
    container: row,
    autoWidth:
      chatWidth === undefined ? undefined : { chatWidth, gitCardShown: gitCardShown ?? false },
  });
  useLayoutEffect(onCommit);
  return <output ref={(host) => (host === null ? undefined : observeRow(host))}>{width}</output>;
}

const setRowWidth = (row: HTMLElement, width: number) => {
  row.style.width = `${width}px`;
};

function setRootFontSize(pixels: number) {
  document.documentElement.style.fontSize = `${pixels}px`;
}

async function mountProbe(props: ProbeProps = {}) {
  await using stack = new AsyncDisposableStack();
  localStorage.clear();
  stack.defer(() => localStorage.clear());
  stack.use(stubGlobal("ResizeObserver", undefined));
  stack.use(vi.spyOn(window, "innerWidth", "get").mockReturnValue(WINDOW_WIDTH));
  const state = { commits: 0, frame: undefined as FrameRequestCallback | undefined };
  stack.use(
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      state.frame = callback;
      return 1;
    }),
  );
  stack.defer(() => {
    document.documentElement.style.fontSize = "";
  });
  setRootFontSize(DEFAULT_REM_PIXELS);
  const row = document.createElement("div");
  setRowWidth(row, ROW_WIDTH);
  document.body.append(row);
  stack.defer(() => row.remove());
  const probe = (next: ProbeProps) => (
    <Probe
      row={row}
      onCommit={() => {
        state.commits += 1;
      }}
      {...next}
    />
  );
  const screen = stack.use(await render(probe(props)));

  const mounted = {
    commits: () => state.commits,
    panelWidth: () => Number(screen.container.querySelector("output")!.textContent),
    rerender: (next: ProbeProps) => screen.rerender(probe(next)),
    setRowWidth: (width: number) => setRowWidth(row, width),
    setRootFontSize,
    async resizeWindow() {
      await act(() => {
        window.dispatchEvent(new Event("resize"));
        state.frame?.(0);
        state.frame = undefined;
      });
    },
  };
  const disposal = stack.move();
  return Object.assign(mounted, { [Symbol.asyncDispose]: () => disposal.disposeAsync() });
}

describe("usePreviewPanelInlineSize auto width", () => {
  it("keeps the default width for a panel without auto width options", async () => {
    await using probe = await mountProbe();

    expect(probe.panelWidth()).toBe(DEFAULT_PANEL_WIDTH);
  });

  it("follows the chat width, the card toggle, the row and the root font size without extra commits", async () => {
    await using probe = await mountProbe({ chatWidth: "comfortable" });
    expect(probe.panelWidth()).toBe(COMFORTABLE_WITHOUT_CARD_WIDTH);

    await probe.rerender({ chatWidth: "comfortable", gitCardShown: true });
    expect(probe.panelWidth()).toBe(COMFORTABLE_WITH_CARD_WIDTH);

    await probe.rerender({ chatWidth: "wide" });
    expect(probe.panelWidth()).toBe(WIDE_WITHOUT_CARD_WIDTH);

    await probe.rerender({ chatWidth: "comfortable" });
    expect(probe.panelWidth()).toBe(COMFORTABLE_WITHOUT_CARD_WIDTH);

    const commitsBeforeUnchangedMeasure = probe.commits();
    await probe.resizeWindow();
    expect(probe.commits()).toBe(commitsBeforeUnchangedMeasure);

    probe.setRowWidth(WIDER_ROW_WIDTH);
    await probe.resizeWindow();
    expect(probe.panelWidth()).toBe(COMFORTABLE_WITHOUT_CARD_IN_WIDER_ROW_WIDTH);

    probe.setRowWidth(ROW_WIDTH);
    probe.setRootFontSize(LARGER_ROOT_FONT_SIZE);
    await probe.resizeWindow();
    expect(probe.panelWidth()).toBe(COMFORTABLE_WITHOUT_CARD_AT_LARGER_ROOT_FONT_SIZE_WIDTH);
  });
});
