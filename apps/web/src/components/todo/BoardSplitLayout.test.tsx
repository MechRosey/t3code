import { act, type KeyboardEvent } from "react";
import { create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { BoardSplitLayout, type BoardSplitDetail } from "./BoardSplitLayout";
import type { BoardSplitMode } from "./boardSplit.logic";
import type { BoardDrawerMode } from "./boardUiState";

const WIDE_CONTAINER = 1200;
const NARROW_CONTAINER = 400;

const ISSUE_PANE_WIDTH_STORAGE_KEY = "t3code:board-issue-drawer-width";

function fakeWindow(initialEntries: ReadonlyArray<readonly [string, string]> = []) {
  const stored = new Map<string, string>(initialEntries);
  return {
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    },
  };
}

function renderLayout(options: {
  readonly containerWidth: number;
  readonly drawerMode: BoardDrawerMode;
  readonly detail: BoardSplitDetail | null;
  readonly onClose: () => void;
  readonly storedEntries?: ReadonlyArray<readonly [string, string]>;
}): ReactTestRenderer {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", fakeWindow(options.storedEntries));
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      <BoardSplitLayout
        primary={<button type="button">Board card</button>}
        detail={options.detail}
        drawerMode={options.drawerMode}
        onClose={options.onClose}
      />,
      { createNodeMock: () => ({ clientWidth: options.containerWidth, focus: () => {} }) },
    );
  });
  return renderer!;
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

function boardWrapper(renderer: ReactTestRenderer): ReactTestInstance {
  const boardButton = renderer.root.find(
    (node) => node.type === "button" && node.props.children === "Board card",
  );
  return boardButton.parent!;
}

function escapeKey(defaultPrevented: boolean): KeyboardEvent<HTMLElement> {
  return {
    key: "Escape",
    defaultPrevented,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLElement>;
}

const isModalNode = (node: ReactTestInstance): boolean =>
  node.props.role === "dialog" || node.props["aria-modal"] === true;

describe("BoardSplitLayout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("BoardSplitLayout_WideContainerWithIssueOpen_ShowsNonModalPaneBesideInteractiveBoard", () => {
    const modes: Array<BoardSplitMode> = [];
    const onClose = vi.fn();
    const renderer = renderLayout({
      containerWidth: WIDE_CONTAINER,
      drawerMode: "normal",
      detail: detailRecordingMode(modes),
      onClose,
    });
    try {
      const aside = renderer.root.findByType("aside");

      expect(modes.at(-1)).toBe("split");
      expect(boardWrapper(renderer).props.hidden).toBe(false);
      expect(renderer.root.findAll(isModalNode)).toHaveLength(0);
      expect(aside.findAll((node) => node.props.role === "separator")).not.toHaveLength(0);

      act(() => aside.props.onKeyDown(escapeKey(true)));
      expect(onClose).not.toHaveBeenCalled();

      const escape = escapeKey(false);
      act(() => aside.props.onKeyDown(escape));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(escape.preventDefault).toHaveBeenCalledTimes(1);

      act(() =>
        renderer.update(
          <BoardSplitLayout
            primary={<button type="button">Board card</button>}
            detail={null}
            drawerMode="normal"
            onClose={onClose}
          />,
        ),
      );
      expect(renderer.root.findAllByType("aside")).toHaveLength(0);
      expect(boardWrapper(renderer).props.hidden).toBe(false);
    } finally {
      act(() => renderer.unmount());
    }
  });

  it("BoardSplitLayout_NarrowContainerOrFullDrawer_StacksPaneOverHiddenBoard", () => {
    const cases: ReadonlyArray<{ containerWidth: number; drawerMode: BoardDrawerMode }> = [
      { containerWidth: NARROW_CONTAINER, drawerMode: "normal" },
      { containerWidth: WIDE_CONTAINER, drawerMode: "full" },
    ];
    for (const { containerWidth, drawerMode } of cases) {
      const modes: Array<BoardSplitMode> = [];
      const renderer = renderLayout({
        containerWidth,
        drawerMode,
        detail: detailRecordingMode(modes),
        onClose: () => {},
      });
      try {
        const aside = renderer.root.findByType("aside");

        expect(modes.at(-1)).toBe("stacked");
        expect(boardWrapper(renderer).props.hidden).toBe(true);
        expect(aside.findAll((node) => node.props.role === "separator")).toHaveLength(0);
        expect(renderer.root.findAll(isModalNode)).toHaveLength(0);
      } finally {
        act(() => renderer.unmount());
      }
    }
  });

  it("BoardSplitLayout_WideContainerOnMount_OpensPaneAtStoredOrDefaultWidth", () => {
    const cases: ReadonlyArray<{
      storedEntries: ReadonlyArray<readonly [string, string]>;
      expectedWidth: number;
    }> = [
      { storedEntries: [[ISSUE_PANE_WIDTH_STORAGE_KEY, "500"]], expectedWidth: 500 },
      { storedEntries: [], expectedWidth: 448 },
    ];
    for (const { storedEntries, expectedWidth } of cases) {
      const renderer = renderLayout({
        containerWidth: WIDE_CONTAINER,
        drawerMode: "normal",
        detail: detailRecordingMode([]),
        onClose: () => {},
        storedEntries,
      });
      try {
        const aside = renderer.root.findByType("aside");

        expect(aside.props.style).toEqual({ width: expectedWidth });
      } finally {
        act(() => renderer.unmount());
      }
    }
  });

  it("BoardSplitLayout_NarrowContainerWithNothingOpen_ShowsBoard", () => {
    const renderer = renderLayout({
      containerWidth: NARROW_CONTAINER,
      drawerMode: "full",
      detail: null,
      onClose: () => {},
    });
    try {
      expect(boardWrapper(renderer).props.hidden).toBe(false);
      expect(renderer.root.findAllByType("aside")).toHaveLength(0);
    } finally {
      act(() => renderer.unmount());
    }
  });
});
