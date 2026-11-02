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
        issue({ id: "abc12-centre", title: "Centre ticket" }),
        issue({ id: "def34-near", title: "Near ticket", parentId: "abc12-centre", depth: 1 }),
        issue({ id: "ghi56-far", title: "Far ticket", parentId: "def34-near", depth: 2 }),
        issue({ id: "jkl78-beyond", title: "Beyond ticket", parentId: "ghi56-far", depth: 3 }),
      ],
      "abc12-centre",
    );
    const onFocusIssue = vi.fn();
    await using screen = await render(<MapView graph={graph} onFocusIssue={onFocusIssue} />);

    const buttons = [...screen.container.querySelectorAll<SVGGElement>('g[role="button"]')];
    const inert = [...screen.container.querySelectorAll<SVGGElement>('g[role="img"]')];

    expect(labels(buttons)).toEqual(["Near ticket - Doing", "Far ticket - Doing"]);
    expect(labels(inert)).toEqual(["Centre ticket - Doing - this ticket", "1 more outside"]);

    const keydown = (key: string) =>
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    await act(() => {
      buttons[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(() => {
      buttons[1]!.dispatchEvent(keydown(" "));
    });
    await act(() => {
      buttons[1]!.dispatchEvent(keydown("a"));
    });
    await act(() => {
      inert[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      inert[1]!.dispatchEvent(keydown("Enter"));
    });
    expect(onFocusIssue.mock.calls).toEqual([["def34-near"], ["ghi56-far"]]);
  });
});
