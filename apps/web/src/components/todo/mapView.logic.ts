import type { TodoIssue } from "@t3tools/contracts";

import {
  boardQuestionBadge,
  boardStatusColourClass,
  boardStatusGlyph,
  boardStatusLabel,
  type BoardQuestionBadge,
} from "@t3tools/client-runtime/state/todo-board-view";

type MapEdgeKind = "tree" | "blocks" | "relates";

interface MapLayout {
  readonly width: number;
  readonly height: number;
}

const dedupKey = (left: string, right: string): string =>
  left < right ? `${left}|${right}` : `${right}|${left}`;

const FOCUS_NODE_WIDTH = 104;
const FOCUS_NODE_HEIGHT = 46;
const FOCUS_OVERFLOW_HEIGHT = 28;
const TRAVERSE_HOPS = 3;
const RENDER_HOPS = 2;
const WIDE_RING_NODE_COUNT = 5;
const CLOSED_STATUSES: ReadonlySet<string> = new Set(["done", "cancelled"]);
const EDGE_KIND_RANK: Record<MapEdgeKind, number> = { tree: 0, blocks: 1, relates: 2 };
const RING_GAPS = {
  TD: { betweenRings: 36, withinRing: 12 },
  LR: { betweenRings: 36, withinRing: 10 },
} as const;
const ANCHOR_SIDES = {
  TD: {
    ring: { towardLater: "bottom", towardEarlier: "top" },
    withinRing: { towardLater: "right", towardEarlier: "left" },
  },
  LR: {
    ring: { towardLater: "right", towardEarlier: "left" },
    withinRing: { towardLater: "bottom", towardEarlier: "top" },
  },
} as const;

export type FocusOrientation = "TD" | "LR";

export type FocusAnchor = "top" | "bottom" | "left" | "right";

interface FocusRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FocusNodeViewModel extends FocusRect {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly glyph: string;
  readonly colourClass: string;
  readonly badge: BoardQuestionBadge;
  readonly isFocus: boolean;
  readonly flagged: boolean;
  readonly hop: number;
}

export interface FocusEdgeViewModel {
  readonly key: string;
  readonly kind: MapEdgeKind;
  readonly from: string;
  readonly to: string;
  readonly fromAnchor: FocusAnchor;
  readonly toAnchor: FocusAnchor;
}

export interface FocusGraph {
  readonly orientation: FocusOrientation;
  readonly nodes: ReadonlyArray<FocusNodeViewModel>;
  readonly edges: ReadonlyArray<FocusEdgeViewModel>;
  readonly hidden: number;
  readonly overflow: FocusRect | null;
  readonly layout: MapLayout;
}

interface FocusEdgeDraft {
  readonly key: string;
  readonly kind: MapEdgeKind;
  readonly from: string;
  readonly to: string;
}

interface FocusIndex {
  readonly byId: ReadonlyMap<string, TodoIssue>;
  readonly childrenOf: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly blockersOf: ReadonlyMap<string, ReadonlyArray<string>>;
}

interface FocusReach {
  readonly hopById: ReadonlyMap<string, number>;
  readonly discoveredVia: ReadonlyMap<string, MapEdgeKind>;
  readonly edges: ReadonlyArray<FocusEdgeDraft>;
  readonly hidden: number;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

const EMPTY_FOCUS_GRAPH: FocusGraph = {
  orientation: "TD",
  nodes: [],
  edges: [],
  hidden: 0,
  overflow: null,
  layout: { width: 0, height: 0 },
};

const compareIds = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function appendTo(map: Map<string, Array<string>>, key: string, value: string): void {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [value]);
  } else {
    list.push(value);
  }
}

function indexIssues(issues: ReadonlyArray<TodoIssue>): FocusIndex {
  const sorted = [...issues].sort((left, right) => compareIds(left.id, right.id));
  const childrenOf = new Map<string, Array<string>>();
  const blockersOf = new Map<string, Array<string>>();
  for (const issue of sorted) {
    if (issue.parentId !== null) appendTo(childrenOf, issue.parentId, issue.id);
    for (const target of issue.links.blocks) appendTo(blockersOf, target, issue.id);
  }
  return {
    byId: new Map(sorted.map((issue) => [issue.id, issue] as const)),
    childrenOf,
    blockersOf,
  };
}

function neighbourIds(issue: TodoIssue, index: FocusIndex): Array<string> {
  return [
    ...(issue.parentId === null ? [] : [issue.parentId]),
    ...(index.childrenOf.get(issue.id) ?? []),
    ...issue.links.blocks,
    ...(index.blockersOf.get(issue.id) ?? []),
    ...issue.links.relates,
  ];
}

function edgeDraft(kind: MapEdgeKind, from: TodoIssue, to: TodoIssue): FocusEdgeDraft {
  return { key: dedupKey(from.id, to.id), kind, from: from.id, to: to.id };
}

function resolveEdge(current: TodoIssue, other: TodoIssue): FocusEdgeDraft {
  if (current.parentId === other.id) return edgeDraft("tree", current, other);
  if (other.parentId === current.id) return edgeDraft("tree", other, current);
  if (current.links.blocks.includes(other.id)) return edgeDraft("blocks", current, other);
  if (other.links.blocks.includes(current.id)) return edgeDraft("blocks", other, current);
  return current.id < other.id
    ? edgeDraft("relates", current, other)
    : edgeDraft("relates", other, current);
}

function walkFromFocus(index: FocusIndex, centreId: string): FocusReach {
  const hopById = new Map<string, number>([[centreId, 0]]);
  const discoveredVia = new Map<string, MapEdgeKind>();
  const seenPairs = new Set<string>();
  const edges: Array<FocusEdgeDraft> = [];
  let hidden = 0;
  let frontier = [centreId];
  for (let hop = 0; hop < TRAVERSE_HOPS && frontier.length > 0; hop += 1) {
    const nextHop = hop + 1;
    const next: Array<string> = [];
    for (const currentId of frontier) {
      const current = index.byId.get(currentId)!;
      for (const neighbourId of neighbourIds(current, index)) {
        const neighbour = index.byId.get(neighbourId);
        if (neighbour === undefined || neighbourId === currentId) continue;
        const isNew = !hopById.has(neighbourId);
        const pairKey = dedupKey(currentId, neighbourId);
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          if (nextHop <= RENDER_HOPS) {
            const edge = resolveEdge(current, neighbour);
            edges.push(edge);
            if (isNew) discoveredVia.set(neighbourId, edge.kind);
          }
        }
        if (!isNew) continue;
        hopById.set(neighbourId, nextHop);
        if (nextHop < TRAVERSE_HOPS) next.push(neighbourId);
        else hidden += 1;
      }
    }
    frontier = next;
  }
  return { hopById, discoveredVia, edges, hidden };
}

function ringsByHop(reach: FocusReach): Array<Array<string>> {
  const rings: Array<Array<string>> = [];
  for (const [id, hop] of reach.hopById) {
    if (hop > RENDER_HOPS) continue;
    const ring = rings[hop];
    if (ring === undefined) rings[hop] = [id];
    else ring.push(id);
  }
  const rank = (id: string): number => EDGE_KIND_RANK[reach.discoveredVia.get(id) ?? "tree"];
  return rings.map((ring) =>
    ring.sort((left, right) => rank(left) - rank(right) || compareIds(left, right)),
  );
}

function layoutRings(
  rings: ReadonlyArray<ReadonlyArray<Size>>,
  orientation: FocusOrientation,
): { readonly rects: Array<Array<FocusRect>>; readonly layout: MapLayout } {
  const gaps = RING_GAPS[orientation];
  const isTopDown = orientation === "TD";
  const thicknessOf = (size: Size): number => (isTopDown ? size.height : size.width);
  const extentOf = (size: Size): number => (isTopDown ? size.width : size.height);
  const ringExtent = (ring: ReadonlyArray<Size>): number =>
    ring.reduce((sum, size) => sum + extentOf(size), 0) + gaps.withinRing * (ring.length - 1);
  const widestExtent = Math.max(0, ...rings.map(ringExtent));
  let mainOffset = 0;
  const rects = rings.map((ring) => {
    let crossOffset = (widestExtent - ringExtent(ring)) / 2;
    const placed = ring.map((size) => {
      const rect = isTopDown
        ? { ...size, x: crossOffset, y: mainOffset }
        : { ...size, x: mainOffset, y: crossOffset };
      crossOffset += extentOf(size) + gaps.withinRing;
      return rect;
    });
    mainOffset += Math.max(...ring.map(thicknessOf)) + gaps.betweenRings;
    return placed;
  });
  const totalThickness = rings.length === 0 ? 0 : mainOffset - gaps.betweenRings;
  return {
    rects,
    layout: isTopDown
      ? { width: widestExtent, height: totalThickness }
      : { width: totalThickness, height: widestExtent },
  };
}

function hasOpenChild(id: string, index: FocusIndex): boolean {
  return (index.childrenOf.get(id) ?? []).some((childId) => {
    const child = index.byId.get(childId);
    return child !== undefined && !CLOSED_STATUSES.has(child.status);
  });
}

function toFocusNode(
  issue: TodoIssue,
  index: FocusIndex,
  isFocus: boolean,
  hop: number,
  rect: FocusRect,
): FocusNodeViewModel {
  return {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    statusLabel: boardStatusLabel(issue.status),
    glyph: boardStatusGlyph(issue.status),
    colourClass: boardStatusColourClass(issue.status),
    badge: boardQuestionBadge(issue),
    isFocus,
    flagged: hasOpenChild(issue.id, index),
    hop,
    ...rect,
  };
}

function edgeAnchors(
  from: FocusNodeViewModel,
  to: FocusNodeViewModel,
  orientation: FocusOrientation,
): Pick<FocusEdgeViewModel, "fromAnchor" | "toAnchor"> {
  const sides = ANCHOR_SIDES[orientation];
  if (from.hop !== to.hop) {
    return from.hop < to.hop
      ? { fromAnchor: sides.ring.towardLater, toAnchor: sides.ring.towardEarlier }
      : { fromAnchor: sides.ring.towardEarlier, toAnchor: sides.ring.towardLater };
  }
  const fromComesFirst = orientation === "TD" ? from.x < to.x : from.y < to.y;
  return fromComesFirst
    ? { fromAnchor: sides.withinRing.towardLater, toAnchor: sides.withinRing.towardEarlier }
    : { fromAnchor: sides.withinRing.towardEarlier, toAnchor: sides.withinRing.towardLater };
}

export function buildFocusGraph(issues: ReadonlyArray<TodoIssue>, centreId: string): FocusGraph {
  const index = indexIssues(issues);
  if (!index.byId.has(centreId)) return EMPTY_FOCUS_GRAPH;
  const reach = walkFromFocus(index, centreId);
  const rings = ringsByHop(reach);
  const orientation = rings.some((ring) => ring.length > WIDE_RING_NODE_COUNT) ? "LR" : "TD";
  const ringSizes: Array<Array<Size>> = rings.map((ring) =>
    ring.map(() => ({ width: FOCUS_NODE_WIDTH, height: FOCUS_NODE_HEIGHT })),
  );
  if (reach.hidden > 0) {
    ringSizes.push([{ width: FOCUS_NODE_WIDTH, height: FOCUS_OVERFLOW_HEIGHT }]);
  }
  const { rects, layout } = layoutRings(ringSizes, orientation);
  const nodes = rings.flatMap((ring, hop) =>
    ring.map((id, position) =>
      toFocusNode(index.byId.get(id)!, index, id === centreId, hop, rects[hop]![position]!),
    ),
  );
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
  const edges = reach.edges.map((draft) => ({
    ...draft,
    ...edgeAnchors(nodesById.get(draft.from)!, nodesById.get(draft.to)!, orientation),
  }));
  const overflow = reach.hidden > 0 ? rects[rings.length]![0]! : null;
  return { orientation, nodes, edges, hidden: reach.hidden, overflow, layout };
}

export function mapTitleLines(title: string, maxChars = 26): Array<string> {
  const budget = Math.max(1, maxChars);
  if (title.length <= budget) return [title];
  const head = title.slice(0, budget);
  const splitAt = head.lastIndexOf(" ");
  const firstLine = splitAt > 0 ? head.slice(0, splitAt) : head;
  let rest = title.slice(firstLine.length).trimStart();
  if (rest.length > budget) rest = `${rest.slice(0, budget - 3)}...`;
  return [firstLine, rest];
}
