import type { TodoBoardSnapshot, TodoIssue } from "@t3tools/contracts";

import {
  boardQuestionBadge,
  boardStatusColourClass,
  boardStatusGlyph,
  boardStatusLabel,
  filterIssuesByTag,
  matchesIssueFreeText,
  matchesTagSpec,
  parseTagSpec,
  type BoardQuestionBadge,
} from "@t3tools/client-runtime/state/todo-board-view";

export const MAP_NODE_WIDTH = 190;
export const MAP_NODE_HEIGHT = 64;
export const MAP_LEVEL_GAP_X = 28;
export const MAP_LEVEL_GAP_Y = 64;

export type MapEdgeKind = "tree" | "blocks" | "relates";

export interface MapNodeViewModel {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly glyph: string;
  readonly colourClass: string;
  readonly hue: number | null;
  readonly tinted: boolean;
  readonly isRoot: boolean;
  readonly badge: BoardQuestionBadge;
  readonly level: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MapEdgeViewModel {
  readonly key: string;
  readonly kind: MapEdgeKind;
  readonly from: string;
  readonly to: string;
}

export interface MapLayout {
  readonly width: number;
  readonly height: number;
}

export interface MapViewModel {
  readonly nodes: ReadonlyArray<MapNodeViewModel>;
  readonly edges: ReadonlyArray<MapEdgeViewModel>;
  readonly layout: MapLayout;
}

const dedupKey = (left: string, right: string): string =>
  left < right ? `${left}|${right}` : `${right}|${left}`;

function levelsByIssueId(
  issues: ReadonlyArray<TodoIssue>,
  issuesById: Map<string, TodoIssue>,
): Map<string, number> {
  const levels = new Map<string, number>();
  for (const issue of issues) {
    if (levels.has(issue.id)) continue;
    const chain: Array<TodoIssue> = [];
    const walked = new Set<string>([issue.id]);
    let current: TodoIssue | undefined = issue;
    while (current !== undefined) {
      chain.push(current);
      const parentId: string | null = current.parentId;
      const parent: TodoIssue | undefined =
        parentId === null ? undefined : issuesById.get(parentId);
      if (parent === undefined) {
        assignChainLevels(chain, levels, chain.length - 1);
        break;
      }
      const knownLevel = levels.get(parent.id);
      if (knownLevel !== undefined) {
        assignChainLevels(chain, levels, knownLevel + chain.length);
        break;
      }
      if (walked.has(parent.id)) {
        assignChainLevels(chain, levels, chain.length - 1);
        break;
      }
      walked.add(parent.id);
      current = parent;
    }
  }
  return levels;
}

function assignChainLevels(
  chain: ReadonlyArray<TodoIssue>,
  levels: Map<string, number>,
  deepest: number,
): void {
  chain.forEach((entry, index) => {
    levels.set(entry.id, deepest - index);
  });
}

function depthFirstOrder(
  issues: ReadonlyArray<TodoIssue>,
  issuesById: Map<string, TodoIssue>,
): Array<TodoIssue> {
  const childrenByParent = new Map<string, Array<TodoIssue>>();
  for (const issue of issues) {
    if (issue.parentId === null || !issuesById.has(issue.parentId)) continue;
    const siblings = childrenByParent.get(issue.parentId);
    if (siblings === undefined) {
      childrenByParent.set(issue.parentId, [issue]);
    } else {
      siblings.push(issue);
    }
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => left.id.localeCompare(right.id));
  }
  const order: Array<TodoIssue> = [];
  const visited = new Set<string>();
  const visit = (issue: TodoIssue): void => {
    if (visited.has(issue.id)) return;
    visited.add(issue.id);
    order.push(issue);
    for (const child of childrenByParent.get(issue.id) ?? []) visit(child);
  };
  const roots = issues
    .filter((issue) => issue.parentId === null || !issuesById.has(issue.parentId))
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const root of roots) visit(root);
  const cyclic = issues
    .filter((issue) => !visited.has(issue.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const issue of cyclic) visit(issue);
  return order;
}

function toNode(
  issue: TodoIssue,
  level: number,
  indexInLevel: number,
  isRoot: boolean,
): MapNodeViewModel {
  return {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    statusLabel: boardStatusLabel(issue.status),
    glyph: boardStatusGlyph(issue.status),
    colourClass: boardStatusColourClass(issue.status),
    hue: issue.rootHue,
    tinted: issue.rootHue !== null && issue.status !== "blocked",
    isRoot,
    badge: boardQuestionBadge(issue),
    level,
    x: indexInLevel * (MAP_NODE_WIDTH + MAP_LEVEL_GAP_X),
    y: level * (MAP_NODE_HEIGHT + MAP_LEVEL_GAP_Y),
    width: MAP_NODE_WIDTH,
    height: MAP_NODE_HEIGHT,
  };
}

function collectEdges(
  issues: ReadonlyArray<TodoIssue>,
  issuesById: Map<string, TodoIssue>,
): Array<MapEdgeViewModel> {
  const edges = new Map<string, MapEdgeViewModel>();
  const add = (left: string, right: string, kind: MapEdgeKind, from: string, to: string): void => {
    const key = dedupKey(left, right);
    if (!edges.has(key)) edges.set(key, { key, kind, from, to });
  };
  for (const issue of issues) {
    if (issue.parentId !== null && issuesById.has(issue.parentId)) {
      add(issue.id, issue.parentId, "tree", issue.id, issue.parentId);
    }
  }
  for (const issue of issues) {
    for (const target of issue.links.blocks) {
      if (issuesById.has(target)) add(issue.id, target, "blocks", issue.id, target);
    }
  }
  for (const issue of issues) {
    for (const target of issue.links.relates) {
      if (issuesById.has(target)) {
        const [from, to] = issue.id < target ? [issue.id, target] : [target, issue.id];
        add(issue.id, target, "relates", from, to);
      }
    }
  }
  return [...edges.values()];
}

export function buildMapView(
  snapshot: TodoBoardSnapshot,
  uiState: {
    readonly tag: string | null;
    readonly tagSpec?: string | null;
    readonly query?: string;
  },
): MapViewModel {
  const specTerms = parseTagSpec(uiState.tagSpec ?? "");
  const issues = filterIssuesByTag(snapshot.issues, uiState.tag).filter(
    (issue) =>
      matchesTagSpec(issue.tags, specTerms) && matchesIssueFreeText(issue, uiState.query ?? ""),
  );
  const issuesById = new Map(issues.map((issue) => [issue.id, issue] as const));
  const levels = levelsByIssueId(issues, issuesById);
  const order = depthFirstOrder(issues, issuesById);
  const indexInLevel = new Map<number, number>();
  const nodes = order.map((issue) => {
    const level = levels.get(issue.id) ?? 0;
    const index = indexInLevel.get(level) ?? 0;
    indexInLevel.set(level, index + 1);
    return toNode(issue, level, index, issue.parentId === null || !issuesById.has(issue.parentId));
  });
  const countByLevel = [...indexInLevel.entries()];
  const width = countByLevel.reduce(
    (max, [, count]) => Math.max(max, count * MAP_NODE_WIDTH + (count - 1) * MAP_LEVEL_GAP_X),
    0,
  );
  const height =
    indexInLevel.size === 0
      ? 0
      : indexInLevel.size * MAP_NODE_HEIGHT + (indexInLevel.size - 1) * MAP_LEVEL_GAP_Y;
  return { nodes, edges: collectEdges(issues, issuesById), layout: { width, height } };
}

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
