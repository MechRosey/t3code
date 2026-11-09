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
type Zone = NonNullable<FocusGraph["nodes"][number]["zone"]>;

const CENTRE = "c";
const PARENT = "p";

function nodeIds(graph: FocusGraph): Array<string> {
  return graph.nodes.map((node) => node.id);
}

function idsIn(graph: FocusGraph, zone: Zone): Array<string> {
  return graph.nodes.filter((node) => node.zone === zone).map((node) => node.id);
}

function markerRows(graph: FocusGraph): Array<[string, number]> {
  return graph.markers.map((marker) => [marker.zone, marker.hidden]);
}

function centreWith(overrides: Partial<TodoIssue> = {}): TodoIssue {
  return issue({ id: CENTRE, title: CENTRE, ...overrides });
}

function parentTicket(): TodoIssue {
  return issue({ id: PARENT, title: PARENT, status: "doing" });
}

function childOf(parentId: string, id: string, status = "backlog"): TodoIssue {
  return issue({ id, title: id, status, parentId, depth: 1 });
}

function blockerOfCentre(id: string, status = "backlog"): TodoIssue {
  return issue({ id, title: id, status, links: { blocks: [CENTRE], relates: [] } });
}

function plain(id: string, status = "backlog"): TodoIssue {
  return issue({ id, title: id, status });
}

function blockersWithStatus(statuses: ReadonlyArray<string>, prefix = "b"): Array<TodoIssue> {
  return statuses.map((status, position) => blockerOfCentre(`${prefix}${position}`, status));
}

function openOnes(count: number, prefix: string): Array<string> {
  return Array.from({ length: count }, (_, position) => `${prefix}${position}`);
}

function backlogs(count: number): Array<string> {
  return Array.from({ length: count }, () => "backlog");
}

function blockedByIds(graph: FocusGraph): Array<string> {
  return idsIn(graph, "blockedBy");
}

describe("focus graph zones", () => {
  it("puts each neighbour in exactly one zone, the first match of parent, children, blocked-by, blocking, siblings", () => {
    const issues = [
      issue({ id: "gp", title: "gp" }),
      issue({
        id: PARENT,
        title: PARENT,
        parentId: "gp",
        depth: 1,
        links: { blocks: [CENTRE], relates: [] },
      }),
      centreWith({
        parentId: PARENT,
        depth: 2,
        links: {
          blocks: ["mutual", "blockee", "sib-blockee", "ghost", CENTRE, "blockee"],
          relates: ["related"],
        },
      }),
      childOf(CENTRE, "kid"),
      issue({
        id: "kid-blocker",
        title: "kid-blocker",
        parentId: CENTRE,
        depth: 3,
        links: { blocks: [CENTRE], relates: [] },
      }),
      blockerOfCentre("blocker"),
      blockerOfCentre("mutual"),
      plain("blockee"),
      childOf(PARENT, "sib"),
      issue({
        id: "sib-blocker",
        title: "sib-blocker",
        parentId: PARENT,
        depth: 2,
        links: { blocks: [CENTRE], relates: [] },
      }),
      childOf(PARENT, "sib-blockee"),
      childOf("kid", "grandkid"),
      plain("related"),
      plain("far"),
    ];

    const graph = buildFocusGraph(issues, CENTRE);

    assert.deepEqual(nodeIds(graph), [
      CENTRE,
      PARENT,
      "sib",
      "kid",
      "kid-blocker",
      "blocker",
      "mutual",
      "sib-blocker",
      "blockee",
      "sib-blockee",
    ]);
    assert.deepEqual(
      graph.nodes.map((node) => [node.id, node.zone]),
      [
        [CENTRE, null],
        [PARENT, "parent"],
        ["sib", "siblings"],
        ["kid", "children"],
        ["kid-blocker", "children"],
        ["blocker", "blockedBy"],
        ["mutual", "blockedBy"],
        ["sib-blocker", "blockedBy"],
        ["blockee", "blocking"],
        ["sib-blockee", "blocking"],
      ],
    );
    assert.deepEqual(
      graph.nodes.filter((node) => node.isFocus).map((node) => node.id),
      [CENTRE],
    );
    assert.deepEqual(graph.markers, []);
  });

  it("gives a root ticket no siblings and a ticket with a missing parent neither parent nor siblings", () => {
    const rootGraph = buildFocusGraph(
      [centreWith(), plain("other-root"), plain("another-root")],
      CENTRE,
    );
    const orphanGraph = buildFocusGraph(
      [
        centreWith({ parentId: "ghost", depth: 1 }),
        childOf("ghost", "orphan-sibling"),
        childOf(CENTRE, "kid"),
      ],
      CENTRE,
    );

    assert.deepEqual(nodeIds(rootGraph), [CENTRE]);
    assert.deepEqual(nodeIds(orphanGraph), [CENTRE, "kid"]);
  });

  it("ignores relates links, missing and self blocks targets and duplicate entries", () => {
    const issues = [
      centreWith({
        links: { blocks: ["gone", CENTRE, "b", "b"], relates: ["r", "gone"] },
      }),
      issue({ id: "b", title: "b", links: { blocks: ["b", "b"], relates: [CENTRE] } }),
      issue({ id: "r", title: "r", links: { blocks: [], relates: [CENTRE] } }),
    ];

    const graph = buildFocusGraph(issues, CENTRE);

    assert.deepEqual(nodeIds(graph), [CENTRE, "b"]);
    assert.deepEqual(idsIn(graph, "blocking"), ["b"]);
  });

  it("returns an empty graph for an unknown focus ticket", () => {
    const empty: FocusGraph = {
      nodes: [],
      markers: [],
      connectors: [],
      labels: [],
      layout: { width: 0, height: 0 },
    };

    assert.deepEqual(buildFocusGraph([plain("n1")], "missing"), empty);
    assert.deepEqual(buildFocusGraph([], "n1"), empty);
  });

  it("builds the same graph whatever order the snapshot lists the tickets in", () => {
    const issues = [
      parentTicket(),
      centreWith({ parentId: PARENT, depth: 1, links: { blocks: ["e1", "e2"], relates: [] } }),
      childOf(PARENT, "s1"),
      childOf(PARENT, "s2", "read"),
      childOf(PARENT, "s3", "doing"),
      childOf(CENTRE, "k1", "doing"),
      childOf(CENTRE, "k2"),
      childOf(CENTRE, "k3", "done"),
      ...blockersWithStatus(["done", "doing", "backlog", "read", "delegated", "backlog"]),
      plain("e1", "cancelled"),
      plain("e2", "read"),
    ];
    const reversed = [...issues].reverse();
    const rotated = [...issues.slice(7), ...issues.slice(0, 7)];

    const expected = buildFocusGraph(issues, CENTRE);

    assert.deepEqual(buildFocusGraph(reversed, CENTRE), expected);
    assert.deepEqual(buildFocusGraph(rotated, CENTRE), expected);
  });
});

describe("focus graph zone order and caps", () => {
  it("lists open tickets by board status order then id, unknown statuses last, closed after open", () => {
    const byStatus = buildFocusGraph(
      [
        centreWith(),
        ...[
          ["z-doing", "doing"],
          ["m-backlog", "backlog"],
          ["c-read", "read"],
          ["b-backlog", "backlog"],
        ].map(([id, status]) => blockerOfCentre(id!, status)),
      ],
      CENTRE,
    );
    const closedLast = buildFocusGraph(
      [
        centreWith(),
        ...[
          ["b-done", "done"],
          ["z-doing", "doing"],
          ["a-cancelled", "cancelled"],
          ["x-unknown", "delegated"],
        ].map(([id, status]) => blockerOfCentre(id!, status)),
      ],
      CENTRE,
    );

    assert.deepEqual(blockedByIds(byStatus), ["b-backlog", "m-backlog", "c-read", "z-doing"]);
    assert.deepEqual(blockedByIds(closedLast), ["z-doing", "x-unknown", "b-done", "a-cancelled"]);
  });

  it("shows all open tickets when they fit the slots and a marker for the rest when they do not", () => {
    const fits = buildFocusGraph(
      [
        parentTicket(),
        centreWith({ parentId: PARENT, depth: 1 }),
        ...blockersWithStatus(backlogs(4)),
        ...openOnes(3, "k").map((id) => childOf(CENTRE, id)),
        ...openOnes(2, "s").map((id) => childOf(PARENT, id)),
      ],
      CENTRE,
    );
    const overflows = buildFocusGraph(
      [
        parentTicket(),
        centreWith({ parentId: PARENT, depth: 1 }),
        ...blockersWithStatus(backlogs(6)),
        ...openOnes(5, "k").map((id) => childOf(CENTRE, id)),
        ...openOnes(3, "s").map((id) => childOf(PARENT, id)),
      ],
      CENTRE,
    );

    assert.deepEqual(fits.markers, []);
    assert.equal(idsIn(fits, "blockedBy").length, 4);
    assert.equal(idsIn(fits, "children").length, 3);
    assert.equal(idsIn(fits, "siblings").length, 2);
    assert.deepEqual(idsIn(overflows, "blockedBy"), ["b0", "b1", "b2"]);
    assert.deepEqual(idsIn(overflows, "children"), ["k0", "k1"]);
    assert.deepEqual(idsIn(overflows, "siblings"), ["s0"]);
    assert.deepEqual(markerRows(overflows), [
      ["siblings", 2],
      ["children", 3],
      ["blockedBy", 3],
    ]);
  });

  it("fills only spare slots with closed tickets and never counts closed tickets in the marker", () => {
    const spare = buildFocusGraph(
      [centreWith(), ...blockersWithStatus(["done", "backlog", "cancelled", "done", "read"])],
      CENTRE,
    );
    const crowded = buildFocusGraph(
      [
        centreWith(),
        ...blockersWithStatus(["doing", "doing", "doing", "doing", "doing", "done", "cancelled"]),
      ],
      CENTRE,
    );
    const exact = buildFocusGraph(
      [
        centreWith(),
        ...blockersWithStatus(["doing", "doing", "doing", "doing", "done", "cancelled"]),
      ],
      CENTRE,
    );
    const kids = buildFocusGraph(
      [
        centreWith(),
        childOf(CENTRE, "k-open"),
        ...["done", "done", "cancelled", "done", "done"].map((status, position) =>
          childOf(CENTRE, `k-closed${position}`, status),
        ),
      ],
      CENTRE,
    );

    assert.deepEqual(blockedByIds(spare), ["b1", "b4", "b0", "b3"]);
    assert.deepEqual(spare.markers, []);
    assert.deepEqual(blockedByIds(crowded), ["b0", "b1", "b2"]);
    assert.deepEqual(markerRows(crowded), [["blockedBy", 2]]);
    assert.deepEqual(blockedByIds(exact), ["b0", "b1", "b2", "b3"]);
    assert.deepEqual(exact.markers, []);
    assert.deepEqual(idsIn(kids, "children"), ["k-open", "k-closed0", "k-closed1"]);
    assert.deepEqual(kids.markers, []);
  });
});

describe("focus graph layout", () => {
  const NODE_WIDTH = 104;
  const NODE_HEIGHT = 46;
  const MARKER_HEIGHT = 28;
  const GRID = { width: 616, height: 297 };

  function rects(graph: FocusGraph): Array<[string, number, number, number, number]> {
    return graph.nodes.map((node) => [node.id, node.x, node.y, node.width, node.height]);
  }

  it("keeps the same grid and centre position whether the zones are full or empty", () => {
    const alone = buildFocusGraph([centreWith()], CENTRE);
    const withParent = buildFocusGraph([parentTicket(), centreWith({ parentId: PARENT })], CENTRE);

    assert.deepEqual(rects(alone), [[CENTRE, 256, 164, NODE_WIDTH, NODE_HEIGHT]]);
    assert.deepEqual(alone.layout, GRID);
    assert.deepEqual(alone.connectors, []);
    assert.deepEqual(alone.labels, []);
    assert.deepEqual(alone.markers, []);
    assert.deepEqual(rects(withParent), [
      [CENTRE, 256, 164, NODE_WIDTH, NODE_HEIGHT],
      [PARENT, 256, 0, NODE_WIDTH, NODE_HEIGHT],
    ]);
    assert.deepEqual(withParent.layout, GRID);
  });

  it("places every zone on the fixed grid with one straight connector per zone", () => {
    const issues = [
      parentTicket(),
      centreWith({ parentId: PARENT, depth: 1, links: { blocks: ["e1"], relates: [] } }),
      childOf(PARENT, "s1"),
      childOf(PARENT, "s2"),
      childOf(CENTRE, "k1"),
      childOf(CENTRE, "k2"),
      blockerOfCentre("b1"),
      plain("e1"),
    ];

    const graph = buildFocusGraph(issues, CENTRE);

    assert.deepEqual(rects(graph), [
      [CENTRE, 256, 164, NODE_WIDTH, NODE_HEIGHT],
      [PARENT, 256, 0, NODE_WIDTH, NODE_HEIGHT],
      ["s1", 140, 82, NODE_WIDTH, NODE_HEIGHT],
      ["s2", 372, 82, NODE_WIDTH, NODE_HEIGHT],
      ["k1", 198, 246, NODE_WIDTH, NODE_HEIGHT],
      ["k2", 314, 246, NODE_WIDTH, NODE_HEIGHT],
      ["b1", 0, 164, NODE_WIDTH, NODE_HEIGHT],
      ["e1", 512, 164, NODE_WIDTH, NODE_HEIGHT],
    ]);
    assert.deepEqual(
      graph.connectors.map((line) => [line.zone, line.kind, line.x1, line.y1, line.x2, line.y2]),
      [
        ["parent", "tree", 308, 164, 308, 46],
        ["siblings", "peer", 244, 105, 372, 105],
        ["children", "tree", 308, 246, 308, 210],
        ["blockedBy", "blocks", 104, 187, 256, 187],
        ["blocking", "blocks", 360, 187, 512, 187],
      ],
    );
    assert.deepEqual(
      graph.labels.map((label) => [label.zone, label.text, label.x, label.y]),
      [
        ["blockedBy", "Blocked by", 52, 71],
        ["blocking", "Blocking", 564, 71],
      ],
    );
    assert.deepEqual(graph.layout, GRID);
  });

  it("stacks a column around the centre line and puts its marker in the last slot", () => {
    const two = buildFocusGraph(
      [centreWith(), ...blockersWithStatus(["backlog", "backlog"])],
      CENTRE,
    );
    const overflowing = buildFocusGraph([centreWith(), ...blockersWithStatus(backlogs(5))], CENTRE);

    assert.deepEqual(
      two.nodes.filter((node) => node.zone === "blockedBy").map((node) => [node.x, node.y]),
      [
        [0, 135],
        [0, 193],
      ],
    );
    assert.deepEqual(
      overflowing.nodes.filter((node) => node.zone === "blockedBy").map((node) => [node.x, node.y]),
      [
        [0, 86],
        [0, 144],
        [0, 202],
      ],
    );
    assert.deepEqual(overflowing.markers, [
      { zone: "blockedBy", hidden: 2, x: 0, y: 260, width: NODE_WIDTH, height: MARKER_HEIGHT },
    ]);
  });

  it("splits siblings around the gap with the marker on the right and joins them to the parent line", () => {
    const one = buildFocusGraph(
      [parentTicket(), centreWith({ parentId: PARENT }), childOf(PARENT, "s1")],
      CENTRE,
    );
    const many = buildFocusGraph(
      [
        parentTicket(),
        centreWith({ parentId: PARENT }),
        childOf(PARENT, "s1"),
        childOf(PARENT, "s2"),
        childOf(PARENT, "s3"),
      ],
      CENTRE,
    );

    assert.deepEqual(
      one.nodes.filter((node) => node.zone === "siblings").map((node) => [node.id, node.x, node.y]),
      [["s1", 372, 82]],
    );
    assert.deepEqual(
      one.connectors.filter((line) => line.zone === "siblings").map((line) => [line.x1, line.x2]),
      [[308, 372]],
    );
    assert.deepEqual(
      many.nodes
        .filter((node) => node.zone === "siblings")
        .map((node) => [node.id, node.x, node.y]),
      [["s1", 140, 82]],
    );
    assert.deepEqual(many.markers, [
      { zone: "siblings", hidden: 2, x: 372, y: 91, width: NODE_WIDTH, height: MARKER_HEIGHT },
    ]);
    assert.deepEqual(
      many.connectors.filter((line) => line.zone === "siblings").map((line) => [line.x1, line.x2]),
      [[244, 372]],
    );
  });

  it("centres the children row and puts its marker in the last slot", () => {
    const one = buildFocusGraph([centreWith(), childOf(CENTRE, "k1")], CENTRE);
    const overflowing = buildFocusGraph(
      [centreWith(), ...openOnes(5, "k").map((id) => childOf(CENTRE, id))],
      CENTRE,
    );

    assert.deepEqual(
      one.nodes.filter((node) => node.zone === "children").map((node) => node.x),
      [256],
    );
    assert.deepEqual(
      overflowing.nodes.filter((node) => node.zone === "children").map((node) => node.x),
      [140, 256],
    );
    assert.deepEqual(overflowing.markers, [
      { zone: "children", hidden: 3, x: 372, y: 255, width: NODE_WIDTH, height: MARKER_HEIGHT },
    ]);
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
        ["kid-open", false, false],
        ["kid-done", false, false],
      ],
    );
    assert.equal(wrapped.nodes[0]!.flagged, false);
  });

  it("flags a ticket whose open child lies outside the drawn graph", () => {
    const issues = [centreWith(), childOf(CENTRE, "k", "done"), childOf("k", "grandkid")];

    const graph = buildFocusGraph(issues, CENTRE);

    assert.deepEqual(nodeIds(graph), [CENTRE, "k"]);
    assert.equal(graph.nodes.find((node) => node.id === "k")!.flagged, true);
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
