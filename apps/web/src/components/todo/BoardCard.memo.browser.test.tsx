import type { ComponentProps } from "react";
import { DndContext, type UseDraggableArguments } from "@dnd-kit/core";
import type { BoardCardViewModel } from "@t3tools/client-runtime/state/todo-board-view";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { BoardDraggableCard, useBoardDragSensors } from "./BoardCard";
import type { BoardDispatchProgress } from "./boardDrop.logic";

const CARD_DRAG_ID_PREFIX = "card:";

const renderedIssueIds = vi.hoisted((): Array<string> => []);

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    useDraggable: (args: UseDraggableArguments) => {
      renderedIssueIds.push(String(args.id).slice(CARD_DRAG_ID_PREFIX.length));
      return actual.useDraggable(args);
    },
  };
});

function cardModel(id: string): BoardCardViewModel {
  return {
    issue: {
      id,
      title: "A board card",
      status: "doing",
      created: "2026-09-24T00:00:00.000Z",
      updated: "2026-09-24T00:00:00.000Z",
      tags: [],
      epic: null,
      parentId: null,
      depth: 0,
      rootHue: null,
      markerPath: `.todo/issues/${id}.md`,
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
    },
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

const CARDS: ReadonlyArray<BoardCardViewModel> = [
  cardModel("aaa11-first"),
  cardModel("bbb22-second"),
  cardModel("ccc33-third"),
];

const NO_PROGRESS: Readonly<Record<string, BoardDispatchProgress>> = {};

const openIssue = () => {};

function BoardStyleColumn({
  cards,
  selectedIssueId,
  progressByIssueId,
}: {
  readonly cards: ReadonlyArray<BoardCardViewModel>;
  readonly selectedIssueId: string | null;
  readonly progressByIssueId: Readonly<Record<string, BoardDispatchProgress>>;
  readonly unrelatedRenderToken: number;
}) {
  const sensors = useBoardDragSensors();
  return (
    <DndContext sensors={sensors} onDragEnd={() => {}}>
      {cards.map((card) => (
        <BoardDraggableCard
          key={card.issue.id}
          card={card}
          progress={progressByIssueId[card.issue.id] ?? null}
          selected={card.issue.id === selectedIssueId}
          onOpen={openIssue}
        />
      ))}
    </DndContext>
  );
}

function takeRenderedIssueIds(): Array<string> {
  return renderedIssueIds.splice(0);
}

function column(props: Omit<ComponentProps<typeof BoardStyleColumn>, "cards">) {
  return <BoardStyleColumn cards={CARDS} {...props} />;
}

describe("board card re-render cost", () => {
  it("BoardDraggableCard_ParentRerenders_RerendersOnlyCardsWhoseOwnPropsChanged", async () => {
    const [first, second, third] = CARDS.map((card) => card.issue.id);
    takeRenderedIssueIds();
    await using screen = await render(
      column({ selectedIssueId: null, progressByIssueId: NO_PROGRESS, unrelatedRenderToken: 0 }),
    );
    expect(takeRenderedIssueIds().toSorted()).toEqual([first, second, third].toSorted());
    expect(screen.container.querySelectorAll("button")).toHaveLength(CARDS.length * 2);

    await screen.rerender(
      column({
        selectedIssueId: null,
        progressByIssueId: NO_PROGRESS,
        unrelatedRenderToken: 1,
      }),
    );
    expect(takeRenderedIssueIds()).toEqual([]);

    await screen.rerender(
      column({
        selectedIssueId: second!,
        progressByIssueId: NO_PROGRESS,
        unrelatedRenderToken: 2,
      }),
    );
    expect(takeRenderedIssueIds()).toEqual([second]);

    await screen.rerender(
      column({
        selectedIssueId: second!,
        progressByIssueId: { [third!]: "starting" },
        unrelatedRenderToken: 3,
      }),
    );
    expect(takeRenderedIssueIds()).toEqual([third]);
  });
});
