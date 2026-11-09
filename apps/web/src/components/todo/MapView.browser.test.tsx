import type { TodoIssue } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { buildFocusGraph } from "./mapView.logic";
import { MapView } from "./MapView";

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

const labels = (elements: ReadonlyArray<Element>) =>
  elements.map((element) => element.getAttribute("aria-label"));

describe("MapView", () => {
  it("MapView_NodesActivated_RefocusesOtherTicketsAndLeavesFocusAndOverflowInert", async () => {
    const graph = buildFocusGraph(
      [
        issue({ id: "abc12-parent", title: "Parent ticket" }),
        issue({
          id: "def34-centre",
          title: "Centre ticket",
          parentId: "abc12-parent",
          depth: 1,
          links: { blocks: ["jkl78-blockee"], relates: [] },
        }),
        issue({ id: "sib1a-first", title: "Sibling A", parentId: "abc12-parent", depth: 1 }),
        issue({ id: "sib2b-second", title: "Sibling B", parentId: "abc12-parent", depth: 1 }),
        issue({ id: "sib3c-third", title: "Sibling C", parentId: "abc12-parent", depth: 1 }),
        issue({ id: "ghi56-child", title: "Child ticket", parentId: "def34-centre", depth: 2 }),
        issue({
          id: "mno90-grandchild",
          title: "Grandchild ticket",
          parentId: "ghi56-child",
          depth: 3,
        }),
        issue({
          id: "pqr12-blocker",
          title: "Blocker ticket",
          links: { blocks: ["def34-centre"], relates: [] },
        }),
        issue({ id: "jkl78-blockee", title: "Blockee ticket" }),
      ],
      "def34-centre",
    );
    const onFocusIssue = vi.fn();
    await using screen = await render(<MapView graph={graph} onFocusIssue={onFocusIssue} />);

    const buttons = [...screen.container.querySelectorAll<SVGGElement>('g[role="button"]')];
    const inert = [...screen.container.querySelectorAll<SVGGElement>('g[role="img"]')];
    const zoneLabels = [...screen.container.querySelectorAll("text")]
      .map((text) => text.textContent)
      .filter((text) => text === "Blocked by" || text === "Blocking");

    expect(labels(buttons)).toEqual([
      "Parent: Parent ticket - Doing",
      "Sibling: Sibling A - Doing",
      "Child: Child ticket - Doing",
      "Blocked by: Blocker ticket - Doing",
      "Blocking: Blockee ticket - Doing",
    ]);
    expect(labels(inert)).toEqual(["Centre ticket - Doing - this ticket", "2 more siblings"]);
    expect(zoneLabels).toEqual(["Blocked by", "Blocking"]);

    const keydown = (key: string) =>
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    await act(() => {
      buttons[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(() => {
      buttons[2]!.dispatchEvent(keydown(" "));
    });
    await act(() => {
      buttons[2]!.dispatchEvent(keydown("a"));
    });
    await act(() => {
      inert[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      inert[1]!.dispatchEvent(keydown("Enter"));
    });
    expect(onFocusIssue.mock.calls).toEqual([["abc12-parent"], ["ghi56-child"]]);
  });
});
