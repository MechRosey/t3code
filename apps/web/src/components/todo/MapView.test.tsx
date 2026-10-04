import { act } from "react";
import { create } from "react-test-renderer";
import type { TodoIssue } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

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

describe("MapView", () => {
  it("MapView_NodesActivated_RefocusesOtherTicketsAndLeavesFocusAndOverflowInert", () => {
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
    let renderer: ReturnType<typeof create> | undefined;
    act(() => {
      renderer = create(<MapView graph={graph} onFocusIssue={onFocusIssue} />);
    });
    try {
      const buttons = renderer!.root.findAll(
        (node) => node.type === "g" && node.props.role === "button",
      );
      const inert = renderer!.root.findAll(
        (node) => node.type === "g" && node.props.role === "img",
      );

      expect(buttons.map((node) => node.props["aria-label"])).toEqual([
        "Near ticket - Doing",
        "Far ticket - Doing",
      ]);
      expect(inert.map((node) => node.props["aria-label"])).toEqual([
        "Centre ticket - Doing - this ticket",
        "1 more outside",
      ]);
      act(() => buttons[0]!.props.onClick());
      act(() => buttons[1]!.props.onKeyDown({ key: " ", preventDefault: () => {} }));
      act(() => buttons[1]!.props.onKeyDown({ key: "a", preventDefault: () => {} }));
      expect(onFocusIssue.mock.calls).toEqual([["def34-near"], ["ghi56-far"]]);
    } finally {
      act(() => renderer!.unmount());
    }
  });
});
