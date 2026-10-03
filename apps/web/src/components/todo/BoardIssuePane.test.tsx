import { act } from "react";
import { create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import type { TodoIssue } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { BoardIssuePane } from "./BoardIssuePane";
import { BoardSplitLayout } from "./BoardSplitLayout";
import type { BoardDrawerMode } from "./boardUiState";

const WIDE_CONTAINER = 1200;
const NARROW_CONTAINER = 400;

function issue(): TodoIssue {
  return {
    id: "abc12-pane-issue",
    title: "A selected ticket",
    status: "backlog",
    created: "2026-09-24T00:00:00.000Z",
    updated: "2026-09-24T00:00:00.000Z",
    tags: ["ui"],
    epic: null,
    parentId: null,
    depth: 0,
    rootHue: null,
    markerPath: ".todo/issues/abc12-pane-issue.md",
    archived: false,
    sections: {
      brief: { content: false, text: "" },
      reading: { content: false, marker: false },
      doing: { content: false, marker: false },
      log: { content: false },
      openQuestions: { content: false, hasOpen: false, hasHumanOpen: false },
    },
    body: "",
    links: { blocks: [], relates: [] },
  };
}

function renderPane(options: {
  readonly containerWidth: number;
  readonly drawerMode: BoardDrawerMode;
  readonly onClose: () => void;
  readonly onDrawerModeChange: (mode: BoardDrawerMode) => void;
}): ReactTestRenderer {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const selected = issue();
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      <BoardSplitLayout
        primary={<button type="button">Board card</button>}
        drawerMode={options.drawerMode}
        onClose={options.onClose}
        detail={{
          key: selected.id,
          render: (splitMode) => (
            <BoardIssuePane
              issue={selected}
              splitMode={splitMode}
              drawerMode={options.drawerMode}
              statusOptions={["backlog", "read", "doing"]}
              boardTags={["ui", "bug"]}
              dispatchInFlight={false}
              viewDiff={null}
              onDrawerModeChange={options.onDrawerModeChange}
              onStatusChange={() => {}}
              onDispatch={() => {}}
              onComment={async () => true}
              onTagAdd={() => {}}
              onTagRemove={() => {}}
              onViewDiff={() => {}}
              onClose={options.onClose}
            />
          ),
        }}
      />,
      { createNodeMock: () => ({ clientWidth: options.containerWidth, focus: () => {} }) },
    );
  });
  return renderer!;
}

function buttonsLabelled(renderer: ReactTestRenderer, label: string): Array<ReactTestInstance> {
  return renderer.root.findAll(
    (node) => node.type === "button" && node.props["aria-label"] === label,
  );
}

const isModalNode = (node: ReactTestInstance): boolean =>
  node.props.role === "dialog" || node.props["aria-modal"] === true;

describe("BoardIssuePane", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("BoardIssuePane_OpenBesideBoard_MountsNoDialogAndClosesFromTheX", () => {
    const onClose = vi.fn();
    const onDrawerModeChange = vi.fn();
    const renderer = renderPane({
      containerWidth: WIDE_CONTAINER,
      drawerMode: "normal",
      onClose,
      onDrawerModeChange,
    });
    try {
      expect(renderer.root.findAll(isModalNode)).toHaveLength(0);
      expect(buttonsLabelled(renderer, "Back to the board")).toHaveLength(0);

      const close = buttonsLabelled(renderer, "Close the issue pane");
      expect(close).toHaveLength(1);
      act(() => close[0]!.props.onClick());
      expect(onClose).toHaveBeenCalledTimes(1);

      const maximise = buttonsLabelled(renderer, "Maximise the issue pane");
      expect(maximise).toHaveLength(1);
      act(() => maximise[0]!.props.onClick());
      expect(onDrawerModeChange).toHaveBeenCalledWith("full");
    } finally {
      act(() => renderer.unmount());
    }
  });

  it("BoardIssuePane_StackedInNarrowContainer_ClosesFromTheBoardBackButtonOnly", () => {
    const onClose = vi.fn();
    const renderer = renderPane({
      containerWidth: NARROW_CONTAINER,
      drawerMode: "normal",
      onClose,
      onDrawerModeChange: () => {},
    });
    try {
      expect(renderer.root.findAll(isModalNode)).toHaveLength(0);
      expect(buttonsLabelled(renderer, "Close the issue pane")).toHaveLength(0);
      expect(buttonsLabelled(renderer, "Maximise the issue pane")).toHaveLength(0);

      const back = buttonsLabelled(renderer, "Back to the board");
      expect(back).toHaveLength(1);
      act(() => back[0]!.props.onClick());
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      act(() => renderer.unmount());
    }
  });

  it("BoardIssuePane_MaximisedInWideContainer_OffersBackAndRestore", () => {
    const onDrawerModeChange = vi.fn();
    const renderer = renderPane({
      containerWidth: WIDE_CONTAINER,
      drawerMode: "full",
      onClose: () => {},
      onDrawerModeChange,
    });
    try {
      expect(buttonsLabelled(renderer, "Back to the board")).toHaveLength(1);
      expect(buttonsLabelled(renderer, "Close the issue pane")).toHaveLength(0);

      const restore = buttonsLabelled(renderer, "Restore the issue pane");
      expect(restore).toHaveLength(1);
      act(() => restore[0]!.props.onClick());
      expect(onDrawerModeChange).toHaveBeenCalledWith("normal");
    } finally {
      act(() => renderer.unmount());
    }
  });
});
