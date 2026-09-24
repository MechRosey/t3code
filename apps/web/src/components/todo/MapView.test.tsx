import { act } from "react";
import { create } from "react-test-renderer";
import type { TodoBoardSnapshot, TodoIssue } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildMapView } from "./mapView.logic";
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

function snapshot(issues: TodoIssue[]): TodoBoardSnapshot {
  return { root: "C:/repo/.todo", repoName: "repo", issues };
}

function collectText(node: { type: unknown; children: ReadonlyArray<unknown> }): Array<string> {
  const texts: Array<string> = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      texts.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
    }
  };
  walk(node.children);
  return texts;
}

describe("map view node labels", () => {
  it("renders the short id instead of the full issue id", () => {
    const longId = "b2ce6-mapview-nodes-show-full";
    const model = buildMapView(snapshot([issue({ id: longId, title: "A mapped ticket" })]), {
      tag: null,
    });
    let renderer: ReturnType<typeof create> | undefined;
    act(() => {
      renderer = create(<MapView model={model} onNodeOpen={() => {}} />);
    });
    try {
      const texts = renderer!.root.findAllByType("text").flatMap((node) => collectText(node));
      expect(texts).toContain("b2ce6");
      expect(texts).not.toContain(longId);
      expect(texts.join(" ")).not.toContain(longId);
    } finally {
      act(() => renderer!.unmount());
    }
  });
});
