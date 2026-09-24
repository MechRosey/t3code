import { act, type KeyboardEvent } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { DndContext } from "@dnd-kit/core";
import type { TodoIssue } from "@t3tools/contracts";
import type { BoardCardViewModel } from "@t3tools/client-runtime/state/todo-board-view";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { BoardCard, BoardDraggableCard } from "./BoardCard";

function issue(overrides: Partial<TodoIssue> & Pick<TodoIssue, "id" | "title">): TodoIssue {
  return {
    status: "doing",
    created: "2026-09-24T00:00:00.000Z",
    updated: "2026-09-24T00:00:00.000Z",
    tags: [],
    epic: null,
    parentId: null,
    depth: 0,
    rootHue: null,
    markerPath: `.todo/issues/${overrides.id}.md`,
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
    ...overrides,
  };
}

function cardModel(id: string): BoardCardViewModel {
  return {
    issue: issue({ id, title: "A board card" }),
    isRoot: true,
    hue: null,
    tinted: false,
    glyph: "\u25b6",
    statusLabel: "Doing",
    colourClass: "",
    badge: null,
    badges: [],
    parent: null,
    blockedBy: [],
  };
}

const isCopyButton = (node: { type: unknown; props: Record<string, unknown> }): boolean =>
  node.type === "button" && String(node.props["aria-label"] ?? "").startsWith("Copy issue id");

describe("board card copy affordance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies the card's short id from a sibling button without opening the drawer", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const onOpen = vi.fn();
    const renderer = await act(async () =>
      create(
        <DndContext>
          <BoardDraggableCard
            card={cardModel("abc12-rest-of-id")}
            onOpen={onOpen}
            progress={null}
          />
        </DndContext>,
      ),
    );
    try {
      const copyButton = renderer.root.find(isCopyButton);
      const cardButton = renderer.root.find(
        (node) => node.type === "button" && node.props.onClick === onOpen,
      );
      expect(cardButton.findAll((node) => node === copyButton)).toHaveLength(0);
      await act(async () => copyButton.props.onClick());
      expect(writeText).toHaveBeenCalledWith("abc12");
      expect(onOpen).not.toHaveBeenCalled();
      expect(String(copyButton.props["aria-label"])).toBe("Copied abc12");
      const stopPropagation = vi.fn();
      const keydown = {
        key: "Enter",
        stopPropagation,
      } as unknown as KeyboardEvent<HTMLButtonElement>;
      await act(async () => copyButton.props.onKeyDown(keydown));
      expect(stopPropagation).toHaveBeenCalledTimes(1);
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      await act(async () => renderer.unmount());
    }
  });

  it("renders the drag-preview card without a copy affordance", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <BoardCard card={cardModel("abc12-rest-of-id")} onOpen={() => {}} progress={null} />,
      );
    });
    try {
      expect(renderer!.root.findAll(isCopyButton)).toHaveLength(0);
    } finally {
      act(() => renderer!.unmount());
    }
  });
});
