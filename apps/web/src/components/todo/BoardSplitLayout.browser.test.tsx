import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BoardSplitLayout, type BoardSplitDetail } from "./BoardSplitLayout";
import type { BoardSplitMode } from "./boardSplit.logic";
import type { BoardDrawerMode } from "./boardUiState";

const WIDE_CONTAINER = 1200;
const NARROW_CONTAINER = 400;

const ISSUE_PANE_WIDTH_STORAGE_KEY = "t3code:board-issue-drawer-width";

let root: Root;
let container: HTMLDivElement;

function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
}

async function unmount() {
  await act(() => root.unmount());
  container.remove();
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  mount();
});

afterEach(async () => {
  await unmount();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function layout(options: {
  readonly drawerMode: BoardDrawerMode;
  readonly detail: BoardSplitDetail | null;
  readonly onClose: () => void;
}) {
  return (
    <BoardSplitLayout
      primary={<button type="button">Board card</button>}
      detail={options.detail}
      drawerMode={options.drawerMode}
      onClose={options.onClose}
    />
  );
}

async function renderLayout(options: {
  readonly containerWidth: number;
  readonly drawerMode: BoardDrawerMode;
  readonly detail: BoardSplitDetail | null;
  readonly onClose: () => void;
}) {
  container.style.width = `${options.containerWidth}px`;
  await act(() => root.render(layout(options)));
}

function detailRecordingMode(modes: Array<BoardSplitMode>): BoardSplitDetail {
  return {
    key: "abc12-issue",
    render: (mode) => {
      modes.push(mode);
      return <p>Issue body</p>;
    },
  };
}

const aside = () => container.querySelector("aside");

function boardWrapper(): HTMLElement {
  const boardButton = [...container.querySelectorAll("button")].find(
    (element) => element.textContent === "Board card",
  );
  return boardButton!.parentElement!;
}

const modalNodes = () => container.querySelectorAll('[role="dialog"], [aria-modal="true"]');

async function pressEscape(options: {
  readonly isComposing?: boolean;
  readonly prevented?: boolean;
}) {
  const target = container.querySelector("aside p")!;
  const stopper = (event: Event) => event.preventDefault();
  if (options.prevented) target.addEventListener("keydown", stopper);
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
    isComposing: options.isComposing ?? false,
  });
  await act(() => {
    target.dispatchEvent(event);
  });
  target.removeEventListener("keydown", stopper);
  return event;
}

describe("BoardSplitLayout", () => {
  it("BoardSplitLayout_WideContainerWithIssueOpen_ShowsNonModalPaneBesideInteractiveBoard", async () => {
    const modes: Array<BoardSplitMode> = [];
    const onClose = vi.fn();
    await renderLayout({
      containerWidth: WIDE_CONTAINER,
      drawerMode: "normal",
      detail: detailRecordingMode(modes),
      onClose,
    });

    expect(modes.at(-1)).toBe("split");
    expect(boardWrapper().hidden).toBe(false);
    expect(modalNodes()).toHaveLength(0);
    expect(aside()!.querySelectorAll('[role="separator"]').length).toBeGreaterThan(0);

    await pressEscape({ prevented: true });
    expect(onClose).not.toHaveBeenCalled();

    const composingEscape = await pressEscape({ isComposing: true });
    expect(onClose).not.toHaveBeenCalled();
    expect(composingEscape.defaultPrevented).toBe(false);

    const escape = await pressEscape({});
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(escape.defaultPrevented).toBe(true);

    await act(() => root.render(layout({ detail: null, drawerMode: "normal", onClose })));
    expect(aside()).toBeNull();
    expect(boardWrapper().hidden).toBe(false);
  });

  it("BoardSplitLayout_NarrowContainerOrFullDrawer_StacksPaneOverHiddenBoard", async () => {
    const cases: ReadonlyArray<{ containerWidth: number; drawerMode: BoardDrawerMode }> = [
      { containerWidth: NARROW_CONTAINER, drawerMode: "normal" },
      { containerWidth: WIDE_CONTAINER, drawerMode: "full" },
    ];
    for (const { containerWidth, drawerMode } of cases) {
      const modes: Array<BoardSplitMode> = [];
      await renderLayout({
        containerWidth,
        drawerMode,
        detail: detailRecordingMode(modes),
        onClose: () => {},
      });

      expect(modes.at(-1)).toBe("stacked");
      expect(boardWrapper().hidden).toBe(true);
      expect(aside()!.querySelectorAll('[role="separator"]')).toHaveLength(0);
      expect(modalNodes()).toHaveLength(0);

      await unmount();
      mount();
    }
  });

  it("BoardSplitLayout_WideContainerOnMount_OpensPaneAtStoredOrDefaultWidth", async () => {
    const cases: ReadonlyArray<{
      storedEntries: ReadonlyArray<readonly [string, string]>;
      expectedWidth: number;
    }> = [
      { storedEntries: [[ISSUE_PANE_WIDTH_STORAGE_KEY, "500"]], expectedWidth: 500 },
      { storedEntries: [], expectedWidth: 448 },
    ];
    for (const { storedEntries, expectedWidth } of cases) {
      localStorage.clear();
      for (const [key, value] of storedEntries) localStorage.setItem(key, value);
      await renderLayout({
        containerWidth: WIDE_CONTAINER,
        drawerMode: "normal",
        detail: detailRecordingMode([]),
        onClose: () => {},
      });

      expect(aside()!.style.width).toBe(`${expectedWidth}px`);

      await unmount();
      mount();
    }
  });

  it("BoardSplitLayout_NarrowContainerWithNothingOpen_ShowsBoard", async () => {
    await renderLayout({
      containerWidth: NARROW_CONTAINER,
      drawerMode: "full",
      detail: null,
      onClose: () => {},
    });

    expect(boardWrapper().hidden).toBe(false);
    expect(aside()).toBeNull();
  });
});
