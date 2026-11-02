import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { BoardSplitLayout, type BoardSplitDetail } from "./BoardSplitLayout";
import type { BoardSplitMode } from "./boardSplit.logic";
import type { BoardDrawerMode } from "./boardUiState";

const WIDE_CONTAINER = 1200;
const NARROW_CONTAINER = 400;

const ISSUE_PANE_WIDTH_STORAGE_KEY = "t3code:board-issue-drawer-width";

function freshStorage(entries: ReadonlyArray<readonly [string, string]> = []): Disposable {
  localStorage.clear();
  for (const [key, value] of entries) localStorage.setItem(key, value);
  return { [Symbol.dispose]: () => localStorage.clear() };
}

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
  const container = document.createElement("div");
  container.style.width = `${options.containerWidth}px`;
  return render(layout(options), { container });
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

const aside = (container: HTMLElement) => container.querySelector("aside");

function boardWrapper(container: HTMLElement): HTMLElement {
  const boardButton = [...container.querySelectorAll("button")].find(
    (element) => element.textContent === "Board card",
  );
  return boardButton!.parentElement!;
}

const modalNodes = (container: HTMLElement) =>
  container.querySelectorAll('[role="dialog"], [aria-modal="true"]');

async function pressEscape(
  container: HTMLElement,
  options: {
    readonly isComposing?: boolean;
    readonly prevented?: boolean;
  },
) {
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
    using _storage = freshStorage();
    const modes: Array<BoardSplitMode> = [];
    const onClose = vi.fn();
    await using screen = await renderLayout({
      containerWidth: WIDE_CONTAINER,
      drawerMode: "normal",
      detail: detailRecordingMode(modes),
      onClose,
    });

    expect(modes.at(-1)).toBe("split");
    expect(boardWrapper(screen.container).hidden).toBe(false);
    expect(modalNodes(screen.container)).toHaveLength(0);
    expect(aside(screen.container)!.querySelectorAll('[role="separator"]').length).toBeGreaterThan(
      0,
    );

    await pressEscape(screen.container, { prevented: true });
    expect(onClose).not.toHaveBeenCalled();

    const composingEscape = await pressEscape(screen.container, { isComposing: true });
    expect(onClose).not.toHaveBeenCalled();
    expect(composingEscape.defaultPrevented).toBe(false);

    const escape = await pressEscape(screen.container, {});
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(escape.defaultPrevented).toBe(true);

    await screen.rerender(layout({ detail: null, drawerMode: "normal", onClose }));
    expect(aside(screen.container)).toBeNull();
    expect(boardWrapper(screen.container).hidden).toBe(false);
  });

  it("BoardSplitLayout_NarrowContainerOrFullDrawer_StacksPaneOverHiddenBoard", async () => {
    const cases: ReadonlyArray<{ containerWidth: number; drawerMode: BoardDrawerMode }> = [
      { containerWidth: NARROW_CONTAINER, drawerMode: "normal" },
      { containerWidth: WIDE_CONTAINER, drawerMode: "full" },
    ];
    for (const { containerWidth, drawerMode } of cases) {
      using _storage = freshStorage();
      const modes: Array<BoardSplitMode> = [];
      await using screen = await renderLayout({
        containerWidth,
        drawerMode,
        detail: detailRecordingMode(modes),
        onClose: () => {},
      });

      expect(modes.at(-1)).toBe("stacked");
      expect(boardWrapper(screen.container).hidden).toBe(true);
      expect(aside(screen.container)!.querySelectorAll('[role="separator"]')).toHaveLength(0);
      expect(modalNodes(screen.container)).toHaveLength(0);
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
      using _storage = freshStorage(storedEntries);
      await using screen = await renderLayout({
        containerWidth: WIDE_CONTAINER,
        drawerMode: "normal",
        detail: detailRecordingMode([]),
        onClose: () => {},
      });

      expect(aside(screen.container)!.style.width).toBe(`${expectedWidth}px`);
    }
  });

  it("BoardSplitLayout_NarrowContainerWithNothingOpen_ShowsBoard", async () => {
    using _storage = freshStorage();
    await using screen = await renderLayout({
      containerWidth: NARROW_CONTAINER,
      drawerMode: "full",
      detail: null,
      onClose: () => {},
    });

    expect(boardWrapper(screen.container).hidden).toBe(false);
    expect(aside(screen.container)).toBeNull();
  });
});
