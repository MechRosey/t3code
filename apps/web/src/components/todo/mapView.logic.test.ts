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

function overflowRows(graph: FocusGraph): Array<[string, number]> {
  return graph.overflows.map((overflow) => [overflow.zone, overflow.hidden]);
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
          relates: ["related", "ghost"],
        },
      }),
      issue({
        id: "kid",
        title: "kid",
        parentId: CENTRE,
        depth: 1,
        links: { blocks: ["kid", "kid"], relates: [CENTRE] },
      }),
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
      issue({ id: "related", title: "related", links: { blocks: [], relates: [CENTRE] } }),
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
    assert.equal(new Set(nodeIds(graph)).size, graph.nodes.length);
    assert.deepEqual(graph.overflows, []);
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

  it("returns an empty graph for an unknown focus ticket", () => {
    const empty: FocusGraph = {
      nodes: [],
      overflows: [],
      connectors: [],
      labels: [],
      layout: { width: 0, height: 0, titleChars: 12 },
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
      ...blockersWithStatus(["done", "doing", "backlog", "read", "not-a-status", "backlog"]),
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
          ["x-unknown", "not-a-status"],
        ].map(([id, status]) => blockerOfCentre(id!, status)),
      ],
      CENTRE,
    );

    assert.deepEqual(blockedByIds(byStatus), ["b-backlog", "m-backlog", "c-read", "z-doing"]);
    assert.deepEqual(blockedByIds(closedLast), ["z-doing", "x-unknown", "b-done", "a-cancelled"]);
  });

  it("shows all open tickets when they fit the slots and a label for the rest when they do not", () => {
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

    assert.deepEqual(fits.overflows, []);
    assert.equal(idsIn(fits, "blockedBy").length, 4);
    assert.equal(idsIn(fits, "children").length, 3);
    assert.equal(idsIn(fits, "siblings").length, 2);
    assert.deepEqual(idsIn(overflows, "blockedBy"), ["b0", "b1", "b2", "b3"]);
    assert.deepEqual(idsIn(overflows, "children"), ["k0", "k1", "k2"]);
    assert.deepEqual(idsIn(overflows, "siblings"), ["s0", "s1"]);
    assert.deepEqual(overflowRows(overflows), [
      ["siblings", 1],
      ["children", 2],
      ["blockedBy", 2],
    ]);
    assert.deepEqual(
      overflows.overflows.map((overflow) => overflow.text),
      ["+1 more", "+2 more", "+2 more"],
    );
  });

  it("shows no label for a zone with exactly as many open tickets as slots and one label with one more", () => {
    const zoneOf = (count: number) => [
      centreWith(),
      ...openOnes(count, "k").map((id) => childOf(CENTRE, id)),
    ];

    const exact = buildFocusGraph(zoneOf(3), CENTRE);
    const oneMore = buildFocusGraph(zoneOf(4), CENTRE);
    const wideExact = buildFocusGraph(zoneOf(5), CENTRE, 640);
    const wideOneMore = buildFocusGraph(zoneOf(6), CENTRE, 640);

    assert.deepEqual([idsIn(exact, "children").length, exact.overflows], [3, []]);
    assert.deepEqual(
      [idsIn(oneMore, "children").length, overflowRows(oneMore)],
      [3, [["children", 1]]],
    );
    assert.deepEqual([idsIn(wideExact, "children").length, wideExact.overflows], [5, []]);
    assert.deepEqual(
      [idsIn(wideOneMore, "children").length, overflowRows(wideOneMore)],
      [5, [["children", 1]]],
    );
  });

  it("fills only spare slots with closed tickets and never counts closed tickets in the label", () => {
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
    assert.deepEqual(spare.overflows, []);
    assert.deepEqual(blockedByIds(crowded), ["b0", "b1", "b2", "b3"]);
    assert.deepEqual(overflowRows(crowded), [["blockedBy", 1]]);
    assert.deepEqual(blockedByIds(exact), ["b0", "b1", "b2", "b3"]);
    assert.deepEqual(exact.overflows, []);
    assert.deepEqual(idsIn(kids, "children"), ["k-open", "k-closed0", "k-closed1"]);
    assert.deepEqual(kids.overflows, []);
  });
});

describe("focus graph layout", () => {
  interface Box {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }

  type Connector = FocusGraph["connectors"][number];
  type ZoneBox = Box & { readonly zone: Zone | null };

  const boxesOf = (graph: FocusGraph): ReadonlyArray<ZoneBox> => graph.nodes;

  const zoneBoxes = (graph: FocusGraph, zone: Zone): Array<Box> =>
    boxesOf(graph).filter((box) => box.zone === zone);

  const overlaps = (left: Box, right: Box): boolean =>
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height;

  const onBoxEdge = (box: Box, x: number, y: number): boolean =>
    x >= box.x &&
    x <= box.x + box.width &&
    y >= box.y &&
    y <= box.y + box.height &&
    (x === box.x || x === box.x + box.width || y === box.y || y === box.y + box.height);

  const onLine = (line: Connector, x: number, y: number): boolean =>
    x >= Math.min(line.x1, line.x2) &&
    x <= Math.max(line.x1, line.x2) &&
    y >= Math.min(line.y1, line.y2) &&
    y <= Math.max(line.y1, line.y2);

  function endpointsLand(graph: FocusGraph): boolean {
    return graph.connectors.every((line) =>
      [
        [line.x1, line.y1],
        [line.x2, line.y2],
      ].every(
        ([x, y]) =>
          boxesOf(graph).some((box) => onBoxEdge(box, x!, y!)) ||
          graph.connectors.some((other) => other !== line && onLine(other, x!, y!)),
      ),
    );
  }

  function neighbourhood(count: number): Array<TodoIssue> {
    return [
      parentTicket(),
      centreWith({
        parentId: PARENT,
        depth: 1,
        links: { blocks: openOnes(count, "e"), relates: [] },
      }),
      ...openOnes(count, "s").map((id) => childOf(PARENT, id)),
      ...openOnes(count, "k").map((id) => childOf(CENTRE, id)),
      ...blockersWithStatus(backlogs(count)),
      ...openOnes(count, "e").map((id) => plain(id)),
    ];
  }

  const COUNTS = [1, 2, 3, 4, 5, 7];
  const WIDTHS = [420, 501, 502, 545, 546, 583, 584, 640, 900, 1200];
  const CASES = COUNTS.flatMap((count) => WIDTHS.map((width) => [count, width] as const));

  const centreOf = (graph: FocusGraph): Box => {
    const { x, y, width, height } = graph.nodes.find((node) => node.id === CENTRE)!;
    return { x, y, width, height };
  };

  const midX = (box: Box): number => box.x + box.width / 2;
  const midY = (box: Box): number => box.y + box.height / 2;

  it("keeps the centre ticket and grid fixed whether the zones are empty or crowded", () => {
    const alone = buildFocusGraph([centreWith()], CENTRE);
    const withParent = buildFocusGraph([parentTicket(), centreWith({ parentId: PARENT })], CENTRE);
    const crowded = buildFocusGraph(neighbourhood(7), CENTRE);

    assert.deepEqual(alone.connectors, []);
    assert.deepEqual(alone.labels, []);
    assert.deepEqual(alone.overflows, []);
    assert.deepEqual(centreOf(withParent), centreOf(alone));
    assert.deepEqual(centreOf(crowded), centreOf(alone));
    assert.deepEqual(withParent.layout, alone.layout);
    assert.equal(crowded.layout.width, alone.layout.width);
    assert.equal(crowded.layout.titleChars, alone.layout.titleChars);
  });

  it("places every zone size without overlap, centred on the centre ticket", () => {
    for (const [count, width] of CASES) {
      const graph = buildFocusGraph(neighbourhood(count), CENTRE, width);
      const centre = centreOf(graph);
      assert.equal(midX(centre), graph.layout.width / 2);
      const boxes = boxesOf(graph);

      for (const [position, box] of boxes.entries()) {
        for (const other of boxes.slice(position + 1)) assert.equal(overlaps(box, other), false);
        assert.ok(box.x >= 0 && box.y >= 0);
        assert.ok(box.x + box.width <= graph.layout.width);
        assert.ok(box.y + box.height <= graph.layout.height);
      }
      for (const zone of ["blockedBy", "blocking"] as const) {
        const column = zoneBoxes(graph, zone);
        const top = Math.min(...column.map((box) => box.y));
        const bottom = Math.max(...column.map((box) => box.y + box.height));
        assert.equal((top + bottom) / 2, midY(centre));
        assert.equal(new Set(column.map((box) => box.x)).size, 1);
      }
      const children = zoneBoxes(graph, "children");
      const rowLeft = Math.min(...children.map((box) => box.x));
      const rowRight = Math.max(...children.map((box) => box.x + box.width));
      assert.equal((rowLeft + rowRight) / 2, midX(centre));
      assert.equal(new Set(children.map((box) => box.y)).size, 1);
      assert.ok(
        graph.nodes
          .filter((node) => node.zone === "parent")
          .every((node) => node.x === centre.x && node.y < centre.y),
      );
    }
  });

  it("lays out as today up to the base width, whatever the width argument, and ignores unusable widths", () => {
    const issues = neighbourhood(7);

    const base = buildFocusGraph(issues, CENTRE);

    assert.deepEqual(buildFocusGraph(issues, CENTRE, 420), base);
    for (const unusable of [380, 100, 1, 0, -50, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.deepEqual(buildFocusGraph(issues, CENTRE, unusable), base);
    }
    assert.deepEqual(
      [base.layout.width, base.layout.titleChars, centreOf(base).width],
      [420, 12, 76],
    );
  });

  it("keeps the three-child layout for every width up to 501, scaled to the pane", () => {
    for (const width of [420, 460, 501]) {
      const graph = buildFocusGraph(neighbourhood(7), CENTRE, width);
      const nodeWidth = Math.floor((width - 40) / 5);
      const centre = centreOf(graph);
      const blocking = zoneBoxes(graph, "blocking");

      assert.equal(centre.width, nodeWidth);
      assert.equal(graph.layout.width, 5 * nodeWidth + 40);
      assert.equal(centre.x, 2 * nodeWidth + 20);
      assert.equal(blocking[0]!.x, 4 * nodeWidth + 40);
      assert.deepEqual(
        [zoneBoxes(graph, "children").length, zoneBoxes(graph, "siblings").length],
        [3, 2],
      );
    }
  });

  it("grows child and sibling capacity through the tiers at the thresholds", () => {
    const capacities = (width: number) => {
      const graph = buildFocusGraph(neighbourhood(7), CENTRE, width);
      return [zoneBoxes(graph, "children").length, zoneBoxes(graph, "siblings").length];
    };

    assert.deepEqual(capacities(420), [3, 2]);
    assert.deepEqual(capacities(501), [3, 2]);
    assert.deepEqual(capacities(502), [4, 2]);
    assert.deepEqual(capacities(520), [4, 2]);
    assert.deepEqual(capacities(545), [4, 2]);
    assert.deepEqual(capacities(546), [4, 4]);
    assert.deepEqual(capacities(560), [4, 4]);
    assert.deepEqual(capacities(583), [4, 4]);
    assert.deepEqual(capacities(584), [5, 4]);
    assert.deepEqual(capacities(640), [5, 4]);
    assert.deepEqual(capacities(2000), [5, 4]);
  });

  it("keeps the layout inside the pane with nodes between the minimum and maximum width", () => {
    for (const [count, width] of CASES) {
      const graph = buildFocusGraph(neighbourhood(count), CENTRE, width);

      assert.ok(graph.layout.width <= width);
      assert.ok(graph.nodes.every((node) => node.width >= 76 && node.width <= 144));
    }
    assert.equal(buildFocusGraph(neighbourhood(7), CENTRE, 5000).layout.width, 7 * 144 + 52);
  });

  it("widens nodes and the title budget with the pane up to a cap, never past the pane", () => {
    const widths = [420, 520, 640, 900, 2000];
    const graphs = widths.map((width) => buildFocusGraph(neighbourhood(3), CENTRE, width));
    const nodeWidths = graphs.map((graph) => centreOf(graph).width);
    const titleChars = graphs.map((graph) => graph.layout.titleChars);
    const layoutWidths = graphs.map((graph) => graph.layout.width);

    assert.deepEqual(nodeWidths, [76, 79, 84, 121, 144]);
    assert.deepEqual(titleChars, [12, 12, 13, 20, 24]);
    assert.deepEqual(layoutWidths, [420, 520, 640, 899, 1060]);
    for (const [position, graph] of graphs.entries()) {
      assert.ok(graph.nodes.every((node) => node.width === nodeWidths[position]));
      assert.ok(layoutWidths[position]! <= widths[position]!);
    }
  });

  it("keeps the centre ticket's size and the grid width fixed at a wide width whether the zones are empty or crowded", () => {
    const alone = buildFocusGraph([centreWith()], CENTRE, 900);
    const crowded = buildFocusGraph(neighbourhood(7), CENTRE, 900);

    assert.deepEqual(centreOf(crowded), centreOf(alone));
    assert.equal(crowded.layout.width, alone.layout.width);
    assert.ok(crowded.nodes.every((node) => node.width === centreOf(alone).width));
  });

  it("places four siblings around a half-node-wide central gap that carries the parent trunk at the 4.5 tier", () => {
    const width = 560;
    const graph = buildFocusGraph(
      [
        parentTicket(),
        centreWith({ parentId: PARENT, depth: 1 }),
        ...openOnes(4, "s").map((id) => childOf(PARENT, id)),
        ...openOnes(4, "k").map((id) => childOf(CENTRE, id)),
      ],
      CENTRE,
      width,
    );
    const centre = centreOf(graph);
    const siblings = zoneBoxes(graph, "siblings");
    const children = zoneBoxes(graph, "children");
    const gapLeft = siblings[1]!.x + siblings[1]!.width;
    const gapRight = siblings[2]!.x;
    const [parentTrunk] = graph.connectors.filter(
      (line) => line.zone === "parent" && line.role === "trunk",
    );
    const [peer] = graph.connectors.filter((line) => line.zone === "siblings");

    assert.deepEqual(idsIn(graph, "siblings"), ["s0", "s1", "s2", "s3"]);
    assert.ok(
      siblings.every((box, position) => position === 0 || box.x > siblings[position - 1]!.x),
    );
    assert.equal(gapRight - gapLeft, centre.width / 2 + 2 * 6);
    assert.ok(parentTrunk!.x1 > gapLeft && parentTrunk!.x1 < gapRight);
    assert.equal(parentTrunk!.x1, midX(centre));
    assert.equal((gapLeft + gapRight) / 2, midX(centre));
    assert.equal(midX(centre), graph.layout.width / 2);
    assert.equal(zoneBoxes(graph, "children").length, 4);
    assert.equal((children[0]!.x + children.at(-1)!.x + centre.width) / 2, midX(centre));
    assert.deepEqual(
      [peer!.x1, peer!.x2, peer!.y1, peer!.y2],
      [siblings[0]!.x + siblings[0]!.width, siblings[3]!.x, midY(siblings[0]!), midY(siblings[3]!)],
    );
  });

  it("sits a lone sibling next to the central gap at the five-child tier", () => {
    const graph = buildFocusGraph(
      [
        parentTicket(),
        centreWith({ parentId: PARENT, depth: 1 }),
        ...openOnes(3, "s").map((id) => childOf(PARENT, id)),
      ],
      CENTRE,
      640,
    );
    const centre = centreOf(graph);
    const [left, rightNear, rightFar] = zoneBoxes(graph, "siblings");

    assert.ok(left!.x + left!.width < midX(centre));
    assert.ok(rightNear!.x > midX(centre));
    assert.equal(rightFar!.x - (rightNear!.x + rightNear!.width), 6);
    assert.equal(midX(centre) - (left!.x + left!.width), rightNear!.x - midX(centre));
  });

  const OLD_CENTRE_Y = 148;
  const OLD_GRID_HEIGHT = 272;
  const SIBLING_CLEARANCE_X = 6;
  const SIBLING_CLEARANCE_Y = 10;
  const TIER_WIDTHS = [
    ["three", 420, true],
    ["four", 502, true],
    ["four and a half", 560, false],
    ["five", 640, true],
  ] as const;

  it("pulls the siblings a quarter node onto the centre ticket where they clear it sideways, else keeps a gap above it", () => {
    for (const [tier, width, overlapping] of TIER_WIDTHS) {
      const graph = buildFocusGraph(neighbourhood(2), CENTRE, width);
      const centre = centreOf(graph);
      const siblings = zoneBoxes(graph, "siblings");
      const siblingsBottom = Math.max(...siblings.map((box) => box.y + box.height));
      const sidewaysGap = Math.min(
        ...siblings.map((box) =>
          Math.max(box.x - (centre.x + centre.width), centre.x - (box.x + box.width)),
        ),
      );

      assert.equal(
        siblingsBottom - centre.y,
        overlapping ? centre.height / 4 : -SIBLING_CLEARANCE_Y,
        tier,
      );
      assert.equal(
        graph.layout.height,
        OLD_GRID_HEIGHT - (OLD_CENTRE_Y - centre.y),
        `${tier} height follows the centre`,
      );
      assert.ok(centre.y < OLD_CENTRE_Y, tier);
      assert.equal(
        sidewaysGap >= SIBLING_CLEARANCE_X,
        overlapping,
        `${tier} sideways gap ${sidewaysGap}`,
      );
    }
  });

  it("never lets a sibling touch the centre ticket in any size, overlapping vertically only with sideways clearance", () => {
    for (const [count, width] of CASES) {
      const graph = buildFocusGraph(neighbourhood(count), CENTRE, width);
      const centre = centreOf(graph);

      for (const sibling of zoneBoxes(graph, "siblings")) {
        const sideways = Math.max(
          sibling.x - (centre.x + centre.width),
          centre.x - (sibling.x + sibling.width),
        );
        const above = centre.y - (sibling.y + sibling.height);

        assert.equal(overlaps(sibling, centre), false);
        assert.ok(
          above >= SIBLING_CLEARANCE_Y || sideways >= SIBLING_CLEARANCE_X,
          `count ${count} width ${width}`,
        );
      }
    }
  });

  it("splits siblings around the gap above the centre with the label above the right-most one", () => {
    const siblingsOf = (count: number) => {
      const graph = buildFocusGraph(
        [
          parentTicket(),
          centreWith({ parentId: PARENT }),
          ...openOnes(count, "s").map((id) => childOf(PARENT, id)),
        ],
        CENTRE,
      );
      const centre = centreOf(graph);
      const siblings = boxesOf(graph).filter((box) => box.zone === "siblings");
      return {
        graph,
        left: siblings.filter((box) => box.x + box.width <= centre.x),
        right: siblings.filter((box) => box.x >= centre.x + centre.width),
      };
    };

    const one = siblingsOf(1);
    const two = siblingsOf(2);
    const many = siblingsOf(3);

    assert.deepEqual([one.left.length, one.right.length], [0, 1]);
    assert.deepEqual([two.left.length, two.right.length], [1, 1]);
    assert.deepEqual([many.left.length, many.right.length], [1, 1]);
    assert.deepEqual(overflowRows(many.graph), [["siblings", 1]]);
    assert.equal(many.graph.overflows[0]!.x, midX(many.right[0]!));
  });

  const LABEL_CHAR_WIDTH = 6;
  const LABEL_ASCENT = 8;
  const LABEL_DESCENT = 3;

  const labelBox = (overflow: FocusGraph["overflows"][number]): Box => ({
    x: overflow.x - (overflow.text.length * LABEL_CHAR_WIDTH) / 2,
    y: overflow.y - LABEL_ASCENT,
    width: overflow.text.length * LABEL_CHAR_WIDTH,
    height: LABEL_ASCENT + LABEL_DESCENT,
  });

  const lineBox = (line: Connector): Box => ({
    x: Math.min(line.x1, line.x2),
    y: Math.min(line.y1, line.y2),
    width: Math.abs(line.x2 - line.x1),
    height: Math.abs(line.y2 - line.y1),
  });

  it("puts each overflow label under the last entry of its zone, above the right-most sibling, clear of every node and connector", () => {
    for (const [count, width] of CASES) {
      const graph = buildFocusGraph(neighbourhood(count), CENTRE, width);
      const alone = buildFocusGraph([centreWith()], CENTRE, width);

      for (const overflow of graph.overflows) {
        const last = zoneBoxes(graph, overflow.zone).at(-1)!;
        const box = labelBox(overflow);

        assert.ok(overflow.hidden > 0);
        assert.equal(overflow.text, `+${overflow.hidden} more`);
        assert.equal(overflow.x, midX(last));
        if (overflow.zone === "siblings") {
          const parent = zoneBoxes(graph, "parent")[0]!;
          assert.ok(box.y + box.height <= last.y);
          assert.ok(box.y >= parent.y + parent.height);
        } else {
          assert.ok(box.y >= last.y + last.height);
        }
        assert.ok(box.x >= 0 && box.x + box.width <= graph.layout.width);
        assert.ok(box.y + box.height <= graph.layout.height);
        assert.equal(
          graph.nodes.some((node) => overlaps(box, node)),
          false,
        );
        assert.equal(
          graph.connectors.some((line) => overlaps(box, lineBox(line))),
          false,
        );
      }
      assert.ok(graph.layout.height >= alone.layout.height);
      if (graph.overflows.length === 0) assert.equal(graph.layout.height, alone.layout.height);
    }
  });

  it("grows the layout height to hold a label under the children row or a column", () => {
    const kids = (count: number) => [
      centreWith(),
      ...openOnes(count, "k").map((id) => childOf(CENTRE, id)),
    ];
    const alone = buildFocusGraph([centreWith()], CENTRE);

    const fits = buildFocusGraph(kids(3), CENTRE);
    const overflowing = buildFocusGraph(kids(4), CENTRE);
    const column = buildFocusGraph([centreWith(), ...blockersWithStatus(backlogs(5))], CENTRE);

    assert.equal(fits.layout.height, alone.layout.height);
    assert.ok(overflowing.layout.height > alone.layout.height);
    assert.ok(column.layout.height > alone.layout.height);
    for (const graph of [overflowing, column]) {
      assert.ok(graph.layout.height >= Math.max(...graph.overflows.map((overflow) => overflow.y)));
    }
  });

  it("runs one trunk per zone to the centre and adds a bus when a zone holds several items", () => {
    for (const [count, width] of CASES) {
      const graph = buildFocusGraph(neighbourhood(count), CENTRE, width);
      const centre = centreOf(graph);
      const lines = (zone: Zone, role: Connector["role"]) =>
        graph.connectors.filter((line) => line.zone === zone && line.role === role);

      assert.ok(endpointsLand(graph));
      for (const zone of ["parent", "siblings", "children", "blockedBy", "blocking"] as const) {
        const hasBus =
          ["children", "blockedBy", "blocking"].includes(zone) && zoneBoxes(graph, zone).length > 1;
        assert.equal(lines(zone, "trunk").length, 1);
        assert.equal(lines(zone, "bus").length, hasBus ? 1 : 0);
      }
      for (const zone of ["blockedBy", "blocking"] as const) {
        const items = zoneBoxes(graph, zone);
        const [trunk] = lines(zone, "trunk");
        const [bus] = lines(zone, "bus");
        assert.equal(trunk!.y1, midY(centre));
        assert.equal(trunk!.y2, midY(centre));
        if (bus === undefined) continue;
        assert.deepEqual(
          [bus.x1 === bus.x2, Math.min(bus.y1, bus.y2), Math.max(bus.y1, bus.y2)],
          [true, midY(items[0]!), midY(items.at(-1)!)],
        );
      }
      const [childBus] = lines("children", "bus");
      if (childBus === undefined) continue;
      const row = zoneBoxes(graph, "children");
      assert.deepEqual(
        [
          childBus.y1 === childBus.y2,
          Math.min(childBus.x1, childBus.x2),
          Math.max(childBus.x1, childBus.x2),
        ],
        [true, midX(row[0]!), midX(row.at(-1)!)],
      );
    }
  });

  it("puts each column label just above the first item of its column", () => {
    for (const [count, width] of CASES) {
      const graph = buildFocusGraph(neighbourhood(count), CENTRE, width);

      assert.deepEqual(
        graph.labels.map((label) => [label.zone, label.text]),
        [
          ["blockedBy", "Blocked by"],
          ["blocking", "Blocking"],
        ],
      );
      for (const label of graph.labels) {
        const first = zoneBoxes(graph, label.zone)[0]!;
        assert.equal(label.x, midX(first));
        assert.ok(label.y - LABEL_ASCENT >= 0);
        assert.ok(label.y < first.y);
        assert.ok(first.y - label.y <= first.height);
      }
    }
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
      epic.nodes.map((node) => [node.id, node.zone === null, node.flagged]),
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
