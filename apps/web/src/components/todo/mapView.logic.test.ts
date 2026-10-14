import type { TodoIssue } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import { buildFocusGraph, mapTitleLines } from "./mapView.logic";

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

describe("map node title lines", () => {
  it("keeps short titles on one line", () => {
    assert.deepEqual(mapTitleLines("short"), ["short"]);
  });

  it("wraps long titles onto two lines at a word boundary", () => {
    assert.deepEqual(mapTitleLines("first words here then", 12), ["first words", "here then"]);
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
    assert.equal(lines[1], "ifrag...");
  });
});

type FocusGraph = ReturnType<typeof buildFocusGraph>;

function nodeIds(graph: FocusGraph): Array<string> {
  return graph.nodes.map((node) => node.id);
}

function edgeRows(graph: FocusGraph): Array<[string, string, string, string, string]> {
  return graph.edges.map((edge) => [edge.kind, edge.from, edge.to, edge.fromAnchor, edge.toAnchor]);
}

function children(parentId: string, ids: ReadonlyArray<string>): Array<TodoIssue> {
  return ids.map((id) => issue({ id, title: id, parentId, depth: 1 }));
}

const NO_CAP = Number.POSITIVE_INFINITY;

function kidsWithStatus(
  parentId: string,
  status: string,
  ids: ReadonlyArray<string>,
): Array<TodoIssue> {
  return children(parentId, ids).map((kid) => ({ ...kid, status }));
}

function chainOfFive(): Array<TodoIssue> {
  return [
    issue({ id: "n1", title: "n1" }),
    issue({ id: "n2", title: "n2", parentId: "n1", depth: 1 }),
    issue({ id: "n3", title: "n3", parentId: "n2", depth: 2 }),
    issue({ id: "n4", title: "n4", parentId: "n3", depth: 3 }),
    issue({ id: "n5", title: "n5", parentId: "n4", depth: 4 }),
  ];
}

describe("focus graph reach", () => {
  it("shows two hops from the focus ticket and counts what lies beyond", () => {
    const atEnd = buildFocusGraph(chainOfFive(), "n1");

    assert.deepEqual(nodeIds(atEnd), ["n1", "n2", "n3"]);
    assert.deepEqual(edgeRows(atEnd), [
      ["tree", "n2", "n1", "top", "bottom"],
      ["tree", "n3", "n2", "top", "bottom"],
    ]);
    assert.equal(atEnd.hidden, 1);
    const inMiddle = buildFocusGraph(chainOfFive(), "n3");
    assert.deepEqual(nodeIds(inMiddle), ["n3", "n2", "n4", "n1", "n5"]);
    assert.equal(inMiddle.edges.length, 4);
    assert.equal(inMiddle.hidden, 0);
    assert.equal(inMiddle.overflow, null);
  });

  it("draws an edge between two first-hop tickets but not between two second-hop tickets", () => {
    const issues = [
      issue({ id: "c", title: "c" }),
      issue({
        id: "k1",
        title: "k1",
        parentId: "c",
        depth: 1,
        links: { blocks: [], relates: ["k2"] },
      }),
      issue({ id: "k2", title: "k2", parentId: "c", depth: 1 }),
      issue({
        id: "g1",
        title: "g1",
        parentId: "k1",
        depth: 2,
        links: { blocks: [], relates: ["g2"] },
      }),
      issue({ id: "g2", title: "g2", parentId: "k1", depth: 2 }),
    ];

    const graph = buildFocusGraph(issues, "c");

    assert.deepEqual(nodeIds(graph), ["c", "k1", "k2", "g1", "g2"]);
    assert.deepEqual(edgeRows(graph), [
      ["tree", "k1", "c", "top", "bottom"],
      ["tree", "k2", "c", "top", "bottom"],
      ["tree", "g1", "k1", "top", "bottom"],
      ["tree", "g2", "k1", "top", "bottom"],
      ["relates", "k1", "k2", "right", "left"],
    ]);
    assert.equal(graph.hidden, 0);
  });

  it("keeps a node reached at the third hop out of the drawing and counts it once", () => {
    const issues = [
      issue({ id: "c", title: "c" }),
      issue({ id: "k", title: "k", parentId: "c", depth: 1 }),
      issue({ id: "g", title: "g", parentId: "k", depth: 2 }),
      issue({ id: "h1", title: "h1", parentId: "g", depth: 3 }),
      issue({
        id: "h2",
        title: "h2",
        parentId: "g",
        depth: 3,
        links: { blocks: ["h1"], relates: [] },
      }),
      issue({ id: "h3", title: "h3", parentId: "h1", depth: 4 }),
    ];

    const graph = buildFocusGraph(issues, "c");

    assert.deepEqual(nodeIds(graph), ["c", "k", "g"]);
    assert.equal(graph.hidden, 2);
  });

  it("returns an empty graph for an unknown focus ticket", () => {
    const empty: FocusGraph = {
      orientation: "TD",
      nodes: [],
      edges: [],
      hidden: 0,
      overflow: null,
      layout: { width: 0, height: 0 },
    };

    assert.deepEqual(buildFocusGraph(chainOfFive(), "missing"), empty);
    assert.deepEqual(buildFocusGraph([], "n1"), empty);
  });
});

describe("focus graph edges", () => {
  function linkedFamily(): Array<TodoIssue> {
    return [
      issue({
        id: "m",
        title: "m",
        parentId: "p",
        depth: 1,
        links: { blocks: ["p", "q"], relates: ["p", "x", "a", "z"] },
      }),
      issue({ id: "p", title: "p" }),
      issue({ id: "q", title: "q", links: { blocks: ["m"], relates: [] } }),
      issue({ id: "x", title: "x", links: { blocks: ["m"], relates: [] } }),
      issue({ id: "a", title: "a" }),
      issue({ id: "z", title: "z" }),
    ];
  }

  it("keeps one edge per pair by tree over blocks over relates and orients each kind", () => {
    const graph = buildFocusGraph(linkedFamily(), "m");

    assert.deepEqual(nodeIds(graph), ["m", "p", "q", "x", "a", "z"]);
    assert.deepEqual(edgeRows(graph), [
      ["tree", "m", "p", "bottom", "top"],
      ["blocks", "m", "q", "bottom", "top"],
      ["blocks", "x", "m", "top", "bottom"],
      ["relates", "a", "m", "top", "bottom"],
      ["relates", "m", "z", "bottom", "top"],
    ]);
    assert.equal(graph.orientation, "TD");
  });

  it("collapses mutual blocks into one edge that leaves the focus ticket", () => {
    const fromM = buildFocusGraph(linkedFamily(), "m");
    const fromQ = buildFocusGraph(linkedFamily(), "q");

    const viewedFromM = fromM.edges.find((edge) => edge.key === "m|q")!;
    const viewedFromQ = fromQ.edges.find((edge) => edge.key === "m|q")!;

    assert.deepEqual([viewedFromM.kind, viewedFromM.from, viewedFromM.to], ["blocks", "m", "q"]);
    assert.deepEqual([viewedFromQ.kind, viewedFromQ.from, viewedFromQ.to], ["blocks", "q", "m"]);
  });

  it("skips links to absent tickets and to the ticket itself", () => {
    const issues = [
      issue({
        id: "solo",
        title: "solo",
        parentId: "ghost",
        depth: 2,
        links: { blocks: ["gone", "solo"], relates: ["vanished", "solo"] },
      }),
    ];

    const graph = buildFocusGraph(issues, "solo");

    assert.deepEqual(nodeIds(graph), ["solo"]);
    assert.deepEqual(graph.edges, []);
    assert.equal(graph.hidden, 0);
  });

  it("terminates on a parent cycle with a single edge", () => {
    const issues = [
      issue({ id: "a", title: "a", parentId: "b", depth: 1 }),
      issue({ id: "b", title: "b", parentId: "a", depth: 1 }),
    ];

    const graph = buildFocusGraph(issues, "a");

    assert.deepEqual(nodeIds(graph), ["a", "b"]);
    assert.deepEqual(edgeRows(graph), [["tree", "a", "b", "bottom", "top"]]);
  });

  it("does not depend on the order the snapshot lists tickets", () => {
    const family = [
      ...linkedFamily(),
      ...children("m", ["kid-b", "kid-a"]),
      issue({ id: "kid-c", title: "kid-c", parentId: "kid-a", depth: 2 }),
    ];
    const reversed = family.toReversed();
    const rotated = [...family.slice(3), ...family.slice(0, 3)];

    const expected = buildFocusGraph(family, "m");

    assert.deepEqual(buildFocusGraph(reversed, "m"), expected);
    assert.deepEqual(buildFocusGraph(rotated, "m"), expected);
    assert.deepEqual(nodeIds(expected).slice(0, 8), [
      "m",
      "kid-a",
      "kid-b",
      "p",
      "q",
      "x",
      "a",
      "z",
    ]);
  });
});

describe("focus graph layout", () => {
  it("places a lone ticket at the origin of a node-sized canvas", () => {
    const graph = buildFocusGraph([issue({ id: "only", title: "only", status: "doing" })], "only");

    assert.deepEqual(graph.nodes, [
      {
        id: "only",
        title: "only",
        status: "doing",
        statusLabel: "Doing",
        glyph: "▶",
        colourClass: "text-primary",
        badge: null,
        isFocus: true,
        flagged: false,
        hop: 0,
        x: 0,
        y: 0,
        width: 104,
        height: 46,
      },
    ]);
    assert.deepEqual(graph.layout, { width: 104, height: 46 });
    assert.deepEqual(graph.edges, []);
  });

  it("stacks hop rings top-down and centres each ring", () => {
    const issues = [issue({ id: "root", title: "root" }), ...children("root", ["kid-b", "kid-a"])];

    const graph = buildFocusGraph(issues, "root");

    assert.deepEqual(
      graph.nodes.map((node) => [node.id, node.hop, node.x, node.y]),
      [
        ["root", 0, 58, 0],
        ["kid-a", 1, 0, 82],
        ["kid-b", 1, 116, 82],
      ],
    );
    assert.deepEqual(graph.layout, { width: 220, height: 128 });
  });

  it("puts the outside-the-map node in its own ring below the last one", () => {
    const graph = buildFocusGraph(chainOfFive(), "n1");

    assert.deepEqual(
      graph.nodes.map((node) => [node.id, node.x, node.y]),
      [
        ["n1", 0, 0],
        ["n2", 0, 82],
        ["n3", 0, 164],
      ],
    );
    assert.deepEqual(graph.overflow, { x: 0, y: 246, width: 104, height: 28 });
    assert.deepEqual(graph.layout, { width: 104, height: 274 });
  });

  it("stays top-down at five tickets in a ring and turns left-right at six", () => {
    const five = buildFocusGraph(
      [issue({ id: "c", title: "c" }), ...children("c", ["k1", "k2", "k3", "k4", "k5"])],
      "c",
    );
    const six = buildFocusGraph(
      [issue({ id: "c", title: "c" }), ...children("c", ["k1", "k2", "k3", "k4", "k5", "k6"])],
      "c",
    );

    assert.equal(five.orientation, "TD");
    assert.equal(six.orientation, "LR");
    assert.deepEqual(
      six.nodes.map((node) => [node.id, node.x, node.y]),
      [
        ["c", 0, 140],
        ["k1", 140, 0],
        ["k2", 140, 56],
        ["k3", 140, 112],
        ["k4", 140, 168],
        ["k5", 140, 224],
        ["k6", 140, 280],
      ],
    );
    assert.deepEqual(six.layout, { width: 244, height: 326 });
    assert.deepEqual(edgeRows(six)[0], ["tree", "k1", "c", "left", "right"]);
  });

  it("turns left-right when the second ring is the wide one and ignores the overflow node", () => {
    const wideSecondRing = buildFocusGraph(
      [
        issue({ id: "c", title: "c" }),
        issue({ id: "k", title: "k", parentId: "c", depth: 1 }),
        ...["g1", "g2", "g3", "g4", "g5", "g6"].map((id) =>
          issue({ id, title: id, parentId: "k", depth: 2 }),
        ),
      ],
      "c",
      NO_CAP,
    );
    const overflowOnly = buildFocusGraph(
      [
        issue({ id: "c", title: "c" }),
        ...children("c", ["k1", "k2", "k3", "k4", "k5"]),
        issue({ id: "g", title: "g", parentId: "k1", depth: 2 }),
        issue({ id: "h", title: "h", parentId: "g", depth: 3 }),
      ],
      "c",
    );

    assert.equal(wideSecondRing.orientation, "LR");
    assert.equal(overflowOnly.orientation, "TD");
    assert.equal(overflowOnly.hidden, 1);
  });
});

describe("focus graph node cap", () => {
  function sevenClosedKidsUnderHub(): Array<TodoIssue> {
    return [
      issue({ id: "c", title: "c" }),
      ...kidsWithStatus("c", "done", ["k1", "k2", "k3", "k4", "k5", "k6", "k7"]),
    ];
  }

  it("draws seven tickets at the cap and drops the lowest id of an exact tie one past it", () => {
    const atCap = buildFocusGraph(sevenClosedKidsUnderHub().slice(0, 7), "c");
    const pastCap = buildFocusGraph(sevenClosedKidsUnderHub(), "c");

    assert.deepEqual(nodeIds(atCap), ["c", "k1", "k2", "k3", "k4", "k5", "k6"]);
    assert.equal(atCap.hidden, 0);
    assert.equal(atCap.overflow, null);
    assert.deepEqual(nodeIds(pastCap), ["c", "k2", "k3", "k4", "k5", "k6", "k7"]);
    assert.equal(pastCap.hidden, 1);
    assert.deepEqual(pastCap.overflow, { x: 280, y: 149, width: 104, height: 28 });
    assert.deepEqual(pastCap.layout, { width: 384, height: 326 });
    assert.ok(pastCap.edges.every((edge) => !edge.key.includes("k1")));
    assert.equal(pastCap.edges.length, 6);
  });

  it("drops cancelled tickets before done ones and closed first-hop tickets before open ones", () => {
    const issues = [
      issue({ id: "c", title: "c" }),
      ...kidsWithStatus("c", "backlog", ["o1", "o2"]),
      ...kidsWithStatus("c", "cancelled", ["x1"]),
      ...kidsWithStatus("c", "done", ["d1"]),
    ];

    const dropsCancelled = buildFocusGraph(issues, "c", 4);
    const dropsBoth = buildFocusGraph(issues, "c", 3);

    assert.deepEqual(nodeIds(dropsCancelled), ["c", "d1", "o1", "o2"]);
    assert.equal(dropsCancelled.hidden, 1);
    assert.deepEqual(nodeIds(dropsBoth), ["c", "o1", "o2"]);
    assert.equal(dropsBoth.hidden, 2);
  });

  it("drops the outermost ring first, then the oldest, within a class", () => {
    const outermost = [
      issue({ id: "c", title: "c" }),
      ...kidsWithStatus("c", "backlog", ["o1"]),
      ...kidsWithStatus("c", "done", ["d1"]),
      issue({ id: "gd", title: "gd", parentId: "o1", depth: 2, status: "done" }),
    ];
    const oldest = [
      issue({ id: "c", title: "c" }),
      ...kidsWithStatus("c", "backlog", ["o1"]),
      issue({
        id: "a-new",
        title: "a-new",
        parentId: "c",
        depth: 1,
        status: "done",
        updated: "2026-09-05T00:00:00.000Z",
      }),
      issue({
        id: "z-old",
        title: "z-old",
        parentId: "c",
        depth: 1,
        status: "done",
        updated: "2026-08-01T00:00:00.000Z",
      }),
    ];

    assert.deepEqual(nodeIds(buildFocusGraph(outermost, "c", 3)), ["c", "d1", "o1"]);
    assert.deepEqual(nodeIds(buildFocusGraph(oldest, "c", 3)), ["c", "a-new", "o1"]);
  });

  it("keeps the same drawn set whatever order the snapshot lists tickets", () => {
    const dated = (id: string, status: string, updated: string): TodoIssue =>
      issue({ id, title: id, parentId: "c", depth: 1, status, updated });
    const family = [
      issue({ id: "c", title: "c" }),
      ...kidsWithStatus("c", "backlog", ["o1", "o2", "o3"]),
      dated("d1", "done", "2026-09-04T00:00:00.000Z"),
      dated("d2", "done", "2026-09-02T00:00:00.000Z"),
      dated("d3", "done", "2026-09-03T00:00:00.000Z"),
      dated("d4", "done", "2026-09-05T00:00:00.000Z"),
      dated("x1", "cancelled", "2026-09-06T00:00:00.000Z"),
    ];
    const reversed = family.toReversed();
    const rotated = [...family.slice(4), ...family.slice(0, 4)];

    const expected = buildFocusGraph(family, "c");

    assert.deepEqual(nodeIds(expected), ["c", "d1", "d3", "d4", "o1", "o2", "o3"]);
    assert.deepEqual(buildFocusGraph(reversed, "c"), expected);
    assert.deepEqual(buildFocusGraph(rotated, "c"), expected);
  });

  it("never drops the focus ticket even when it is done", () => {
    const issues = [
      issue({ id: "c", title: "c", status: "done" }),
      ...kidsWithStatus("c", "done", ["d1", "d2"]),
    ];

    const graph = buildFocusGraph(issues, "c", 1);

    assert.deepEqual(nodeIds(graph), ["c"]);
    assert.equal(graph.hidden, 2);
    assert.notEqual(graph.overflow, null);
  });

  it("draws every open first-hop ticket past the cap and drops the closed ones", () => {
    const openStatuses = ["backlog", "read", "doing", "blocked"];
    const openKids = ["o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8", "o9"].map((id, position) =>
      issue({
        id,
        title: id,
        parentId: "c",
        depth: 1,
        status: openStatuses[position % openStatuses.length]!,
      }),
    );
    const issues = [
      issue({ id: "c", title: "c" }),
      ...openKids,
      ...kidsWithStatus("c", "done", ["d1", "d2"]),
    ];

    const graph = buildFocusGraph(issues, "c");

    assert.deepEqual(nodeIds(graph), ["c", "o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8", "o9"]);
    assert.equal(graph.hidden, 2);
  });

  it("clamps a zero or negative cap to the focus ticket and its open first hop", () => {
    const issues = [
      issue({ id: "c", title: "c" }),
      ...kidsWithStatus("c", "backlog", ["o1", "o2"]),
      ...kidsWithStatus("c", "done", ["d1"]),
    ];

    const atZero = buildFocusGraph(issues, "c", 0);
    const belowZero = buildFocusGraph(issues, "c", -3);

    assert.deepEqual(nodeIds(atZero), ["c", "o1", "o2"]);
    assert.equal(atZero.hidden, 1);
    assert.deepEqual(belowZero, atZero);
  });

  it("drops a second-hop ticket left without a drawn connector but keeps one that still has one", () => {
    const issues = [
      issue({ id: "c", title: "c" }),
      ...kidsWithStatus("c", "backlog", ["o1"]),
      ...kidsWithStatus("c", "done", ["d1"]),
      issue({
        id: "d2",
        title: "d2",
        parentId: "c",
        depth: 1,
        status: "done",
        links: { blocks: [], relates: ["g2"] },
      }),
      issue({ id: "g1", title: "g1", parentId: "d1", depth: 2 }),
      issue({ id: "g2", title: "g2", parentId: "d1", depth: 2 }),
    ];

    const graph = buildFocusGraph(issues, "c", 5);

    assert.deepEqual(nodeIds(graph), ["c", "d2", "o1", "g2"]);
    assert.equal(graph.hidden, 2);
    assert.deepEqual(graph.edges.map((edge) => edge.key).toSorted(), ["c|d2", "c|o1", "d2|g2"]);
  });

  it("ranks a second-hop ticket reached by a one-sided relates link as open, not a follow-on", () => {
    const issues = [
      issue({ id: "c", title: "c" }),
      issue({
        id: "A",
        title: "A",
        parentId: "c",
        depth: 1,
        links: { blocks: [], relates: ["z-related"] },
      }),
      issue({ id: "g-child", title: "g-child", parentId: "A", depth: 2 }),
      issue({ id: "z-related", title: "z-related" }),
    ];

    const graph = buildFocusGraph(issues, "c", 3);

    assert.deepEqual(nodeIds(graph), ["c", "A", "z-related"]);
    assert.equal(graph.hidden, 1);
  });

  it("ranks a ticket whose status names an Object prototype member as open", () => {
    const issues = [
      issue({ id: "c", title: "c" }),
      issue({ id: "A", title: "A", parentId: "c", depth: 1 }),
      issue({ id: "d", title: "d", parentId: "A", depth: 2, status: "done" }),
      issue({ id: "a-odd", title: "a-odd", parentId: "A", depth: 2, status: "constructor" }),
    ];

    const graph = buildFocusGraph(issues, "c", 3);

    assert.deepEqual(nodeIds(graph), ["c", "A", "a-odd"]);
  });

  it("chooses top-down or left-right from the rings left after the cap", () => {
    const issues = [
      issue({ id: "c", title: "c" }),
      ...kidsWithStatus("c", "done", ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8"]),
    ];

    assert.equal(buildFocusGraph(issues, "c", NO_CAP).orientation, "LR");
    assert.equal(buildFocusGraph(issues, "c", 7).orientation, "LR");
    assert.equal(buildFocusGraph(issues, "c", 6).orientation, "TD");
  });

  it("counts dropped tickets and third-hop tickets together in the outside-the-map node", () => {
    const issues = [
      ...sevenClosedKidsUnderHub(),
      issue({ id: "g", title: "g", parentId: "k7", depth: 2 }),
      issue({ id: "h", title: "h", parentId: "g", depth: 3 }),
    ];

    const graph = buildFocusGraph(issues, "c");

    assert.deepEqual(nodeIds(graph), ["c", "k3", "k4", "k5", "k6", "k7", "g"]);
    assert.equal(graph.hidden, 3);
    assert.equal(graph.orientation, "TD");
    assert.deepEqual(graph.overflow, { x: 232, y: 246, width: 104, height: 28 });
    assert.deepEqual(graph.layout, { width: 568, height: 274 });
  });
});

describe("focus graph nodes", () => {
  it("marks the focus ticket and flags tickets that still have open children", () => {
    const issues = [
      issue({ id: "epic", title: "epic", status: "doing" }),
      issue({ id: "kid-open", title: "open", parentId: "epic", depth: 1 }),
      issue({ id: "kid-done", title: "done", parentId: "epic", depth: 1, status: "done" }),
      issue({ id: "wrapped", title: "wrapped", status: "doing" }),
      issue({ id: "w-done", title: "w1", parentId: "wrapped", depth: 1, status: "done" }),
      issue({
        id: "w-cancelled",
        title: "w2",
        parentId: "wrapped",
        depth: 1,
        status: "cancelled",
      }),
    ];

    const epic = buildFocusGraph(issues, "epic");
    const wrapped = buildFocusGraph(issues, "wrapped");

    assert.deepEqual(
      epic.nodes.map((node) => [node.id, node.isFocus, node.flagged]),
      [
        ["epic", true, true],
        ["kid-done", false, false],
        ["kid-open", false, false],
      ],
    );
    assert.equal(wrapped.nodes[0]!.flagged, false);
  });

  it("flags a ticket whose open child lies outside the drawn graph", () => {
    const issues = chainOfFive().map((entry) =>
      entry.id === "n3" ? { ...entry, status: "done" } : entry,
    );

    const graph = buildFocusGraph(issues, "n1");

    assert.equal(graph.nodes.find((node) => node.id === "n3")!.flagged, true);
  });

  it("carries the open-question badge and status furniture onto the node", () => {
    const asked = issue({
      id: "asked",
      title: "asked",
      status: "blocked",
      sections: {
        brief: { content: false, text: "" },
        reading: { content: false, marker: false },
        doing: { content: false, marker: false },
        log: { content: false },
        openQuestions: { content: true, hasOpen: true, hasHumanOpen: true },
      },
    });

    const node = buildFocusGraph([asked], "asked").nodes[0]!;

    assert.deepEqual(
      [node.badge, node.statusLabel, node.glyph, node.colourClass],
      ["human", "Blocked", "⛔", "text-error"],
    );
  });
});
