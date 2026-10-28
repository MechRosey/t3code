import { DndContext } from "@dnd-kit/core";
import type { TodoIssue } from "@t3tools/contracts";
import type { BoardCardViewModel } from "@t3tools/client-runtime/state/todo-board-view";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
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
    glyph: "▶",
    statusLabel: "Doing",
    colourClass: "",
    badge: null,
    badges: [],
    parent: null,
    blockedBy: [],
  };
}

const COPY_LABEL_PREFIX = "Copy issue id";

const allButtons = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLButtonElement>("button"),
];
const copyButtons = (container: HTMLElement) =>
  allButtons(container).filter(
    (button) => button.ariaLabel?.startsWith(COPY_LABEL_PREFIX) === true,
  );
const cardButtons = (container: HTMLElement) =>
  allButtons(container).filter(
    (button) => button.ariaLabel?.startsWith(COPY_LABEL_PREFIX) !== true,
  );

function stubClipboard(writeText: (text: string) => Promise<void>): Disposable {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return { [Symbol.dispose]: () => void Reflect.deleteProperty(navigator, "clipboard") };
}

describe("board card copy affordance", () => {
  it("copies the card's short id from a sibling button without opening the drawer", async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    using _clipboard = stubClipboard(writeText);
    const onOpen = vi.fn();
    const bodyKeydowns: Array<KeyboardEvent> = [];
    const recordKeydown = (event: KeyboardEvent) => bodyKeydowns.push(event);
    document.body.addEventListener("keydown", recordKeydown);
    try {
      await using screen = await render(
        <DndContext>
          <BoardDraggableCard
            card={cardModel("abc12-rest-of-id")}
            onOpen={onOpen}
            progress={null}
            selected={false}
          />
        </DndContext>,
      );
      const [copyButton] = copyButtons(screen.container);
      const [cardButton] = cardButtons(screen.container);
      expect(copyButtons(screen.container)).toHaveLength(1);
      expect(cardButtons(screen.container)).toHaveLength(1);
      expect(cardButton!.contains(copyButton!)).toBe(false);

      await act(async () => copyButton!.click());
      expect(writeText).toHaveBeenCalledWith("abc12");
      expect(onOpen).not.toHaveBeenCalled();
      expect(copyButton!.ariaLabel).toBe("Copied abc12");

      await act(async () => {
        copyButton!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
        );
      });
      expect(bodyKeydowns).toHaveLength(0);
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      document.body.removeEventListener("keydown", recordKeydown);
    }
  });

  it("BoardDraggableCard_SelectedOrNot_MarksOnlyTheOpenCardCurrent", async () => {
    await using screen = await render(
      <DndContext>
        <BoardDraggableCard
          card={cardModel("abc12-open")}
          onOpen={() => {}}
          progress={null}
          selected
        />
        <BoardDraggableCard
          card={cardModel("def34-closed")}
          onOpen={() => {}}
          progress={null}
          selected={false}
        />
      </DndContext>,
    );

    expect(cardButtons(screen.container).map((card) => card.getAttribute("aria-current"))).toEqual([
      "true",
      null,
    ]);
  });

  it("renders the drag-preview card without a copy affordance", async () => {
    await using screen = await render(
      <BoardCard card={cardModel("abc12-rest-of-id")} onOpen={() => {}} progress={null} />,
    );

    expect(cardButtons(screen.container)).toHaveLength(1);
    expect(copyButtons(screen.container)).toHaveLength(0);
  });
});
