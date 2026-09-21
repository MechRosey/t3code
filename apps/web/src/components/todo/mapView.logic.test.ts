import type { TodoBoardSnapshot, TodoIssue } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import {
  buildMapView,
  MAP_NODE_HEIGHT,
  MAP_NODE_WIDTH,
  mapTitleLines,
  type MapNodeViewModel,
} from "./mapView.logic";

function issue(overrides: Partial<TodoIssue> & Pick<TodoIssue, "id" | "title">): TodoIssue {
  return {
    status: "backlog",
    created: "2026-09-01T00:00:00.000Z",
    updated: "2026-09-01T00:00:00.000Z",
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

function nodesById(model: ReturnType<typeof buildMapView>): Map<string, MapNodeViewModel> {
  return new Map(model.nodes.map((node) => [node.id, node] as const));
}

describe("map view-model nodes", () => {
  it("derives nodes from the snapshot with status furniture and hue", () => {
    const model = buildMapView(
      snapshot([
        issue({ id: "root", title: "epic", status: "doing", rootHue: 210 }),
        issue({ id: "child", title: "task", parentId: "root", depth: 1, rootHue: 210 }),
      ]),
      { tag: null },
    );
    const nodes = nodesById(model);
    const root = nodes.get("root")!;
    assert.equal(root.glyph, "\u25b6");
    assert.equal(root.statusLabel, "Doing");
    assert.equal(root.hue, 210);
    assert.equal(root.tinted, true);
    assert.equal(root.badge, null);
    assert.equal(nodes.get("child")!.level, 1);
  });

  it("leaves hueless and blocked nodes untinted", () => {
    const model = buildMapView(
      snapshot([
        issue({ id: "plain", title: "plain" }),
        issue({ id: "stuck", title: "stuck", status: "blocked", rootHue: 210 }),
      ]),
      { tag: null },
    );
    const nodes = nodesById(model);
    assert.equal(nodes.get("plain")!.tinted, false);
    assert.equal(nodes.get("plain")!.hue, null);
    assert.equal(nodes.get("stuck")!.tinted, false);
    assert.equal(nodes.get("stuck")!.hue, 210);
  });

  it("carries the open-question badge onto the node", () => {
    const model = buildMapView(
      snapshot([
        issue({
          id: "a",
          title: "asked",
          sections: {
            brief: { content: false, text: "" },
            reading: { content: false, marker: false },
            doing: { content: false, marker: false },
            log: { content: false },
            openQuestions: { content: true, hasOpen: true, hasHumanOpen: true },
          },
        }),
      ]),
      { tag: null },
    );
    assert.equal(model.nodes[0]!.badge, "human");
  });
});

describe("map edges", () => {
  it("draws tree edges child to parent", () => {
    const model = buildMapView(
      snapshot([
        issue({ id: "root", title: "root" }),
        issue({ id: "child", title: "child", parentId: "root", depth: 1 }),
      ]),
      { tag: null },
    );
    assert.deepEqual(
      model.edges.map((edge) => [edge.kind, edge.from, edge.to]),
      [["tree", "child", "root"]],
    );
  });

  it("draws blocks edges blocker to blocked across the tree", () => {
    const model = buildMapView(
      snapshot([
        issue({ id: "blocker", title: "first", links: { blocks: ["target"], relates: [] } }),
        issue({ id: "target", title: "then" }),
      ]),
      { tag: null },
    );
    assert.deepEqual(
      model.edges.map((edge) => [edge.kind, edge.from, edge.to]),
      [["blocks", "blocker", "target"]],
    );
  });

  it("draws relates edges from the lexicographically smaller id", () => {
    const model = buildMapView(
      snapshot([
        issue({ id: "m", title: "em", links: { blocks: [], relates: ["a"] } }),
        issue({ id: "a", title: "ay" }),
      ]),
      { tag: null },
    );
    assert.deepEqual(
      model.edges.map((edge) => [edge.kind, edge.from, edge.to]),
      [["relates", "a", "m"]],
    );
  });

  it("collapses a blocks cycle between two issues into one undirected edge", () => {
    const model = buildMapView(
      snapshot([
        issue({ id: "a", title: "a", links: { blocks: ["b"], relates: [] } }),
        issue({ id: "b", title: "b", links: { blocks: ["a"], relates: [] } }),
      ]),
      { tag: null },
    );
    assert.equal(model.edges.length, 1);
    assert.equal(model.edges[0]!.kind, "blocks");
    assert.equal(model.edges[0]!.from, "a");
    assert.equal(model.edges[0]!.to, "b");
  });

  it("keeps one edge per pair when a tree edge doubles as a blocks edge", () => {
    const model = buildMapView(
      snapshot([
        issue({ id: "root", title: "root" }),
        issue({
          id: "child",
          title: "child",
          parentId: "root",
          depth: 1,
          links: { blocks: ["root"], relates: [] },
        }),
      ]),
      { tag: null },
    );
    assert.equal(model.edges.length, 1);
    assert.equal(model.edges[0]!.kind, "tree");
  });

  it("drops edges whose targets are absent from the snapshot", () => {
    const model = buildMapView(
      snapshot([
        issue({
          id: "orphan",
          title: "orphan",
          parentId: "ghost",
          depth: 3,
          links: { blocks: ["gone"], relates: ["vanished"] },
        }),
        issue({ id: "present", title: "present" }),
      ]),
      { tag: null },
    );
    assert.deepEqual(model.edges, []);
    assert.deepEqual(
      model.nodes.map((node) => node.id),
      ["orphan", "present"],
    );
  });

  it("orders edge kinds tree first, then blocks, then relates", () => {
    const model = buildMapView(
      snapshot([
        issue({
          id: "root",
          title: "root",
          links: { blocks: ["extra"], relates: ["child"] },
        }),
        issue({
          id: "child",
          title: "child",
          parentId: "root",
          depth: 1,
          links: { blocks: ["extra"], relates: ["root"] },
        }),
        issue({ id: "extra", title: "extra" }),
      ]),
      { tag: null },
    );
    assert.deepEqual(
      model.edges.map((edge) => [edge.kind, edge.from, edge.to]),
      [
        ["tree", "child", "root"],
        ["blocks", "child", "extra"],
        ["relates", "child", "root"],
      ],
    );
  });
});

describe("map layout", () => {
  it("stacks levels top-down and places siblings left to right", () => {
    const model = buildMapView(
      snapshot([
        issue({ id: "root", title: "root" }),
        issue({ id: "kid-b", title: "b", parentId: "root", depth: 1 }),
        issue({ id: "kid-a", title: "a", parentId: "root", depth: 1 }),
        issue({ id: "leaf", title: "leaf", parentId: "kid-b", depth: 2 }),
      ]),
      { tag: null },
    );
    const nodes = nodesById(model);
    const root = nodes.get("root")!;
    const kidA = nodes.get("kid-a")!;
    const kidB = nodes.get("kid-b")!;
    const leaf = nodes.get("leaf")!;
    assert.equal(root.level, 0);
    assert.equal(kidA.level, 1);
    assert.equal(kidB.level, 1);
    assert.equal(leaf.level, 2);
    assert.ok(kidA.x < kidB.x);
    assert.equal(root.y, 0);
    assert.equal(kidA.y, MAP_NODE_HEIGHT + 64);
    assert.equal(kidA.width, MAP_NODE_WIDTH);
    assert.equal(kidA.height, MAP_NODE_HEIGHT);
    assert.equal(model.layout.height, 3 * MAP_NODE_HEIGHT + 2 * 64);
    assert.equal(model.layout.width, 2 * MAP_NODE_WIDTH + 28);
  });

  it("orders nodes by id within a parent and stays stable when the snapshot order shuffles", () => {
    const issues = [
      issue({ id: "root", title: "root" }),
      issue({ id: "kid-b", title: "b", parentId: "root", depth: 1 }),
      issue({ id: "kid-a", title: "a", parentId: "root", depth: 1 }),
      issue({ id: "other", title: "other" }),
    ];
    const ordered = buildMapView(snapshot(issues), { tag: null });
    const shuffled = buildMapView(snapshot([issues[3]!, issues[1]!, issues[0]!, issues[2]!]), {
      tag: null,
    });
    assert.deepEqual(
      ordered.nodes.map((node) => [node.id, node.x, node.y]),
      [
        ["other", 0, 0],
        ["root", MAP_NODE_WIDTH + 28, 0],
        ["kid-a", 0, MAP_NODE_HEIGHT + 64],
        ["kid-b", MAP_NODE_WIDTH + 28, MAP_NODE_HEIGHT + 64],
      ],
    );
    assert.deepEqual(ordered.nodes, shuffled.nodes);
    assert.deepEqual(ordered.edges, shuffled.edges);
  });

  it("promotes children of tag-filtered or absent parents to the top level", () => {
    const model = buildMapView(
      snapshot([
        issue({ id: "root", title: "root", tags: ["hidden"] }),
        issue({ id: "child", title: "child", parentId: "root", depth: 1 }),
        issue({ id: "orphan", title: "orphan", parentId: "ghost", depth: 3 }),
      ]),
      { tag: "hidden" },
    );
    assert.deepEqual(
      model.nodes.map((node) => [node.id, node.level]),
      [
        ["child", 0],
        ["orphan", 0],
      ],
    );
    assert.deepEqual(model.edges, []);
  });

  it("terminates on a parentId cycle instead of hanging", () => {
    const model = buildMapView(
      snapshot([
        issue({ id: "a", title: "a", parentId: "b", depth: 1 }),
        issue({ id: "b", title: "b", parentId: "a", depth: 1 }),
      ]),
      { tag: null },
    );
    assert.equal(model.nodes.length, 2);
    assert.deepEqual(model.edges, []);
  });

  it("handles empty and single-node boards", () => {
    const empty = buildMapView(snapshot([]), { tag: null });
    assert.deepEqual(empty.nodes, []);
    assert.deepEqual(empty.edges, []);
    assert.deepEqual(empty.layout, { width: 0, height: 0 });
    const single = buildMapView(snapshot([issue({ id: "only", title: "only" })]), { tag: null });
    assert.equal(single.nodes.length, 1);
    assert.deepEqual({ x: single.nodes[0]!.x, y: single.nodes[0]!.y }, { x: 0, y: 0 });
    assert.deepEqual(single.edges, []);
    assert.deepEqual(single.layout, { width: MAP_NODE_WIDTH, height: MAP_NODE_HEIGHT });
  });
});

describe("map node title lines", () => {
  it("keeps short titles on one line", () => {
    assert.deepEqual(mapTitleLines("short"), ["short"]);
  });

  it("wraps long titles onto two lines at a word boundary", () => {
    assert.deepEqual(mapTitleLines("first words here then more", 12), [
      "first words",
      "here then more",
    ]);
  });

  it("truncates an overflowing second line with an ellipsis", () => {
    const lines = mapTitleLines("aaaa bbbb cccc dddd eeee ffff", 10);
    assert.equal(lines.length, 2);
    assert.equal(lines[0], "aaaa bbbb");
    assert.ok(lines[1]!.length <= 10);
    assert.match(lines[1]!, /\.\.\.$/);
  });

  it("hard-breaks a single word longer than the budget", () => {
    const lines = mapTitleLines("supercalifragilistic", 8);
    assert.equal(lines.length, 2);
    assert.equal(lines[0], "supercal");
    assert.equal(lines[1], "ifragili...");
  });
});
