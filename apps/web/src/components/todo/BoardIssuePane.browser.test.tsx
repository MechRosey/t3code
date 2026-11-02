import type { TodoIssue } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
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

async function renderPane(options: {
  readonly containerWidth: number;
  readonly drawerMode: BoardDrawerMode;
  readonly onClose: () => void;
  readonly onDrawerModeChange: (mode: BoardDrawerMode) => void;
}) {
  const selected = issue();
  const container = document.createElement("div");
  container.style.width = `${options.containerWidth}px`;
  return render(
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
            focusGraph={null}
            onFocusIssue={() => {}}
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
    { container },
  );
}

function buttonsLabelled(container: HTMLElement, label: string): Array<HTMLButtonElement> {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
    (button) => button.getAttribute("aria-label") === label,
  );
}

const modalNodes = (container: HTMLElement) =>
  container.querySelectorAll('[role="dialog"], [aria-modal="true"]');

async function click(button: HTMLButtonElement) {
  await act(() => button.click());
}

describe("BoardIssuePane", () => {
  it("BoardIssuePane_OpenBesideBoard_MountsNoDialogAndClosesFromTheX", async () => {
    const onClose = vi.fn();
    const onDrawerModeChange = vi.fn();
    await using screen = await renderPane({
      containerWidth: WIDE_CONTAINER,
      drawerMode: "normal",
      onClose,
      onDrawerModeChange,
    });

    expect(modalNodes(screen.container)).toHaveLength(0);
    expect(buttonsLabelled(screen.container, "Back to the board")).toHaveLength(0);

    const close = buttonsLabelled(screen.container, "Close the issue pane");
    expect(close).toHaveLength(1);
    await click(close[0]!);
    expect(onClose).toHaveBeenCalledTimes(1);

    const maximise = buttonsLabelled(screen.container, "Maximise the issue pane");
    expect(maximise).toHaveLength(1);
    await click(maximise[0]!);
    expect(onDrawerModeChange).toHaveBeenCalledWith("full");
  });

  it("BoardIssuePane_StackedInNarrowContainer_ClosesFromTheBoardBackButtonOnly", async () => {
    const onClose = vi.fn();
    await using screen = await renderPane({
      containerWidth: NARROW_CONTAINER,
      drawerMode: "normal",
      onClose,
      onDrawerModeChange: () => {},
    });

    expect(modalNodes(screen.container)).toHaveLength(0);
    expect(buttonsLabelled(screen.container, "Close the issue pane")).toHaveLength(0);
    expect(buttonsLabelled(screen.container, "Maximise the issue pane")).toHaveLength(0);

    const back = buttonsLabelled(screen.container, "Back to the board");
    expect(back).toHaveLength(1);
    await click(back[0]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("BoardIssuePane_MaximisedInWideContainer_OffersBackAndRestore", async () => {
    const onDrawerModeChange = vi.fn();
    await using screen = await renderPane({
      containerWidth: WIDE_CONTAINER,
      drawerMode: "full",
      onClose: () => {},
      onDrawerModeChange,
    });

    expect(buttonsLabelled(screen.container, "Back to the board")).toHaveLength(1);
    expect(buttonsLabelled(screen.container, "Close the issue pane")).toHaveLength(0);

    const restore = buttonsLabelled(screen.container, "Restore the issue pane");
    expect(restore).toHaveLength(1);
    await click(restore[0]!);
    expect(onDrawerModeChange).toHaveBeenCalledWith("normal");
  });
});
