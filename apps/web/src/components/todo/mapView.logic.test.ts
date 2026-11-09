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
  interface Box {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }

  type Connector = FocusGraph["connectors"][number];
  type ZoneBox = Box & { readonly zone: Zone | null };

  const boxesOf = (graph: FocusGraph): Array<ZoneBox> => [...graph.nodes, ...graph.markers];

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
    assert.deepEqual(alone.markers, []);
    assert.deepEqual(centreOf(withParent), centreOf(alone));
    assert.deepEqual(centreOf(crowded), centreOf(alone));
    assert.deepEqual(withParent.layout, alone.layout);
    assert.deepEqual(crowded.layout, alone.layout);
  });

  it("places every zone size without overlap, centred on the centre ticket, marker last", () => {
    for (const count of COUNTS) {
      const graph = buildFocusGraph(neighbourhood(count), CENTRE);
      const centre = centreOf(graph);
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
      for (const marker of graph.markers) {
        const vertical = marker.zone === "blockedBy" || marker.zone === "blocking";
        for (const peer of graph.nodes.filter((node) => node.zone === marker.zone)) {
          assert.ok(vertical ? marker.y > peer.y : marker.x > peer.x);
        }
      }
      assert.ok(
        graph.nodes
          .filter((node) => node.zone === "parent")
          .every((node) => node.x === centre.x && node.y < centre.y),
      );
    }
  });

  it("splits siblings around the gap above the centre with the marker on the right", () => {
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
    assert.deepEqual(
      many.graph.markers.map((marker) => marker.hidden),
      [2],
    );
    assert.equal(many.right[0], many.graph.markers[0]);
  });

  it("runs one trunk per zone to the centre and adds a bus when a zone holds several items", () => {
    for (const count of COUNTS) {
      const graph = buildFocusGraph(neighbourhood(count), CENTRE);
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
    for (const count of COUNTS) {
      const graph = buildFocusGraph(neighbourhood(count), CENTRE);

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
