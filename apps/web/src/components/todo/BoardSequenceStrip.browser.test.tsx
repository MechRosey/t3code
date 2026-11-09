import "~/index.css";

import { DndContext } from "@dnd-kit/core";
import { describe, expect, it } from "vite-plus/test";

import { render } from "../../../test/render";
import { BoardSequenceStrip } from "./BoardSequenceStrip";
import type { SequenceChip } from "./boardSequence.logic";

function chip(id: string, status: string, matches: boolean): SequenceChip {
  return { id, shortId: id.slice(0, 5), title: `Title of ${id}`, status, matches };
}

const FULL_OPACITY = "1";

const ignore = () => {};

const itemContaining = (list: Element, text: string) =>
  [...list.querySelectorAll("li")].find((item) => item.textContent?.includes(text));

describe("BoardSequenceStrip", () => {
  it("BoardSequenceStrip_FilteredStrip_DimsNonMatchingChipsAndKeepsDoingLeftOfNext", async () => {
    const strip = {
      doing: [chip("a0001-doing", "doing", true)],
      next: [chip("c0001-match", "read", true), chip("d0001-faded", "backlog", false)],
    };

    await using screen = await render(
      <DndContext>
        <BoardSequenceStrip strip={strip} onOpen={ignore} onRemove={ignore} />
      </DndContext>,
    );

    const doing = screen.getByRole("list", { name: "Doing" }).element();
    const next = screen.getByRole("list", { name: "Next" }).element();
    const matching = itemContaining(next, "c0001");
    const faded = itemContaining(next, "d0001");
    expect(matching).toBeDefined();
    expect(faded).toBeDefined();
    expect(getComputedStyle(matching!).opacity).toBe(FULL_OPACITY);
    expect(Number(getComputedStyle(faded!).opacity)).toBeLessThan(Number(FULL_OPACITY));
    expect(itemContaining(doing, "a0001")).toBeDefined();
    expect(doing.getBoundingClientRect().right).toBeLessThanOrEqual(
      next.getBoundingClientRect().left,
    );
  });
});
