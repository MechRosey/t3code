import type { TodoIssue } from "@t3tools/contracts";

import {
  BOARD_STATUS_ORDER,
  boardQuestionBadge,
  boardStatusColourClass,
  boardStatusGlyph,
  boardStatusLabel,
  capToSlots,
  isClosedStatus,
  type BoardQuestionBadge,
} from "@t3tools/client-runtime/state/todo-board-view";

export type FocusZone = "parent" | "siblings" | "children" | "blockedBy" | "blocking";

type ConnectorKind = "tree" | "blocks" | "peer";

type ConnectorRole = "trunk" | "bus";

export const BASE_AVAILABLE_WIDTH = 420;
export const TEXT_INSET_X = 6;
const AVAILABLE_WIDTH_STEP = 8;
const MIN_NODE_WIDTH = 76;
const MAX_NODE_WIDTH = 144;
const TITLE_CHAR_WIDTH = 5.3;
const FOCUS_NODE_HEIGHT = 46;
const FOCUS_MARKER_HEIGHT = 28;
const SLOT_GAP = 6;
const COLUMN_GAP = 14;
const ROW_GAP = 28;
const LABEL_GAP = 6;

const SIDE_COLUMN_SLOTS = 4;
const PARENT_SLOTS = 1;
const SIBLING_SLOTS_PER_SIDE = 1;
const SIBLING_SLOTS = SIBLING_SLOTS_PER_SIDE * 2;
const CENTRE_BLOCK_SLOTS = SIBLING_SLOTS + 1;
const CHILD_ROW_SLOTS = CENTRE_BLOCK_SLOTS;
const GRID_NODE_COLUMNS = CENTRE_BLOCK_SLOTS + 2;
const GRID_FIXED_WIDTH = 2 * COLUMN_GAP + (CENTRE_BLOCK_SLOTS - 1) * SLOT_GAP;

const PARENT_Y = 0;
const SIBLING_Y = PARENT_Y + FOCUS_NODE_HEIGHT + ROW_GAP;
const CENTRE_Y = SIBLING_Y + FOCUS_NODE_HEIGHT + ROW_GAP;
const CHILD_Y = CENTRE_Y + FOCUS_NODE_HEIGHT + ROW_GAP;
const CENTRE_MID_Y = CENTRE_Y + FOCUS_NODE_HEIGHT / 2;
const SIBLING_MID_Y = SIBLING_Y + FOCUS_NODE_HEIGHT / 2;

const COLUMN_HEIGHT = SIDE_COLUMN_SLOTS * FOCUS_NODE_HEIGHT + (SIDE_COLUMN_SLOTS - 1) * SLOT_GAP;
const COLUMN_TOP = CENTRE_MID_Y - COLUMN_HEIGHT / 2;
const GRID_HEIGHT = Math.max(CHILD_Y + FOCUS_NODE_HEIGHT, COLUMN_TOP + COLUMN_HEIGHT);

interface FocusGeometry {
  readonly nodeWidth: number;
  readonly slotPitch: number;
  readonly blockWidth: number;
  readonly blockX: number;
  readonly leftColumnX: number;
  readonly rightColumnX: number;
  readonly siblingLeftX: number;
  readonly siblingRightX: number;
  readonly centreX: number;
  readonly centreMidX: number;
  readonly layout: MapLayout;
}

function nodeWidthFor(availableWidth: number): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return MIN_NODE_WIDTH;
  const fitted = Math.floor((availableWidth - GRID_FIXED_WIDTH) / GRID_NODE_COLUMNS);
  return Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, fitted));
}

export const snapAvailableWidth = (width: number): number =>
  Math.floor(width / AVAILABLE_WIDTH_STEP) * AVAILABLE_WIDTH_STEP;

function titleCharsFor(nodeWidth: number): number {
  return Math.floor((nodeWidth - 2 * TEXT_INSET_X) / TITLE_CHAR_WIDTH);
}

function focusGeometryFor(availableWidth: number): FocusGeometry {
  const nodeWidth = nodeWidthFor(availableWidth);
  const slotPitch = nodeWidth + SLOT_GAP;
  const blockWidth = CENTRE_BLOCK_SLOTS * nodeWidth + (CENTRE_BLOCK_SLOTS - 1) * SLOT_GAP;
  const leftColumnX = 0;
  const blockX = leftColumnX + nodeWidth + COLUMN_GAP;
  const rightColumnX = blockX + blockWidth + COLUMN_GAP;
  const centreX = blockX + SIBLING_SLOTS_PER_SIDE * slotPitch;
  return {
    nodeWidth,
    slotPitch,
    blockWidth,
    blockX,
    leftColumnX,
    rightColumnX,
    siblingLeftX: blockX,
    siblingRightX: blockX + (CENTRE_BLOCK_SLOTS - 1) * slotPitch,
    centreX,
    centreMidX: centreX + nodeWidth / 2,
    layout: {
      width: rightColumnX + nodeWidth,
      height: GRID_HEIGHT,
      titleChars: titleCharsFor(nodeWidth),
    },
  };
}

const ZONE_RENDER_ORDER: ReadonlyArray<FocusZone> = [
  "parent",
  "siblings",
  "children",
  "blockedBy",
  "blocking",
];

const ZONE_SLOTS: Record<FocusZone, number> = {
  parent: PARENT_SLOTS,
  siblings: SIBLING_SLOTS,
  children: CHILD_ROW_SLOTS,
  blockedBy: SIDE_COLUMN_SLOTS,
  blocking: SIDE_COLUMN_SLOTS,
};

const COLUMN_LABELS: Partial<
  Record<FocusZone, { readonly text: string; readonly x: (geometry: FocusGeometry) => number }>
> = {
  blockedBy: { text: "Blocked by", x: (geometry) => geometry.leftColumnX + geometry.nodeWidth / 2 },
  blocking: { text: "Blocking", x: (geometry) => geometry.rightColumnX + geometry.nodeWidth / 2 },
};

const STATUS_RANK: ReadonlyMap<string, number> = new Map(
  BOARD_STATUS_ORDER.map((status, position) => [status, position] as const),
);
const UNKNOWN_STATUS_RANK = BOARD_STATUS_ORDER.length;

interface MapLayout {
  readonly width: number;
  readonly height: number;
  readonly titleChars: number;
}

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
  readonly flagged: boolean;
  readonly zone: FocusZone | null;
}

export interface FocusMarkerViewModel extends FocusRect {
  readonly zone: FocusZone;
  readonly hidden: number;
}

export interface FocusConnectorViewModel {
  readonly zone: FocusZone;
  readonly role: ConnectorRole;
  readonly kind: ConnectorKind;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface FocusLabelViewModel {
  readonly zone: FocusZone;
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export interface FocusGraph {
  readonly nodes: ReadonlyArray<FocusNodeViewModel>;
  readonly markers: ReadonlyArray<FocusMarkerViewModel>;
  readonly connectors: ReadonlyArray<FocusConnectorViewModel>;
  readonly labels: ReadonlyArray<FocusLabelViewModel>;
  readonly layout: MapLayout;
}

type ZoneItem =
  | { readonly kind: "issue"; readonly issue: TodoIssue }
  | { readonly kind: "more"; readonly hidden: number };

interface CappedZone {
  readonly shown: ReadonlyArray<TodoIssue>;
  readonly hidden: number;
}

interface PlacedZone {
  readonly nodes: ReadonlyArray<FocusNodeViewModel>;
  readonly markers: ReadonlyArray<FocusMarkerViewModel>;
  readonly connectors: ReadonlyArray<FocusConnectorViewModel>;
  readonly labels: ReadonlyArray<FocusLabelViewModel>;
}

const EMPTY_FOCUS_GRAPH: FocusGraph = {
  nodes: [],
  markers: [],
  connectors: [],
  labels: [],
  layout: { width: 0, height: 0, titleChars: titleCharsFor(MIN_NODE_WIDTH) },
};

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const statusRankOf = (issue: TodoIssue): number =>
  STATUS_RANK.get(issue.status) ?? UNKNOWN_STATUS_RANK;

const compareByStatusThenId = (left: TodoIssue, right: TodoIssue): number =>
  statusRankOf(left) - statusRankOf(right) || compareStrings(left.id, right.id);

function zoneOf(
  candidate: TodoIssue,
  centre: TodoIssue,
  parentId: string | null,
): FocusZone | null {
  if (candidate.id === parentId) return "parent";
  if (candidate.parentId === centre.id) return "children";
  if (candidate.links.blocks.includes(centre.id)) return "blockedBy";
  if (centre.links.blocks.includes(candidate.id)) return "blocking";
  if (parentId !== null && candidate.parentId === parentId) return "siblings";
  return null;
}

function partitionNeighbours(
  issues: ReadonlyArray<TodoIssue>,
  centre: TodoIssue,
  knownIds: ReadonlySet<string>,
): Record<FocusZone, Array<TodoIssue>> {
  const parentId =
    centre.parentId !== null && knownIds.has(centre.parentId) ? centre.parentId : null;
  const zones: Record<FocusZone, Array<TodoIssue>> = {
    parent: [],
    siblings: [],
    children: [],
    blockedBy: [],
    blocking: [],
  };
  for (const candidate of issues) {
    if (candidate.id === centre.id) continue;
    const zone = zoneOf(candidate, centre, parentId);
    if (zone !== null) zones[zone].push(candidate);
  }
  return zones;
}

function capZone(neighbours: ReadonlyArray<TodoIssue>, slots: number): CappedZone {
  const ranked = [...neighbours].sort(compareByStatusThenId);
  const open = ranked.filter((issue) => !isClosedStatus(issue.status));
  const capped = capToSlots(open, slots);
  if (capped.hidden > 0) return capped;
  const closed = ranked.filter((issue) => isClosedStatus(issue.status));
  return { shown: [...open, ...closed.slice(0, slots - open.length)], hidden: 0 };
}

function zoneItems(capped: CappedZone): Array<ZoneItem> {
  const items: Array<ZoneItem> = capped.shown.map((issue) => ({ kind: "issue", issue }));
  if (capped.hidden > 0) items.push({ kind: "more", hidden: capped.hidden });
  return items;
}

const itemHeight = (item: ZoneItem): number =>
  item.kind === "issue" ? FOCUS_NODE_HEIGHT : FOCUS_MARKER_HEIGHT;

function rectInRow(geometry: FocusGeometry, x: number, rowY: number, height: number): FocusRect {
  return { x, y: rowY + (FOCUS_NODE_HEIGHT - height) / 2, width: geometry.nodeWidth, height };
}

const siblingsOnLeft = (count: number): number => Math.floor(count / 2);

function placeSiblings(geometry: FocusGeometry, heights: ReadonlyArray<number>): Array<FocusRect> {
  const leftCount = siblingsOnLeft(heights.length);
  return heights.map((height, position) =>
    rectInRow(
      geometry,
      position < leftCount ? geometry.siblingLeftX : geometry.siblingRightX,
      SIBLING_Y,
      height,
    ),
  );
}

function placeChildren(geometry: FocusGeometry, heights: ReadonlyArray<number>): Array<FocusRect> {
  const rowWidth = heights.length * geometry.nodeWidth + (heights.length - 1) * SLOT_GAP;
  let rowX = geometry.blockX + (geometry.blockWidth - rowWidth) / 2;
  return heights.map((height) => {
    const rect = { x: rowX, y: CHILD_Y, width: geometry.nodeWidth, height };
    rowX += geometry.slotPitch;
    return rect;
  });
}

function stackColumn(
  geometry: FocusGeometry,
  x: number,
  heights: ReadonlyArray<number>,
): Array<FocusRect> {
  const stackHeight =
    heights.reduce((sum, height) => sum + height, 0) + (heights.length - 1) * SLOT_GAP;
  let y = CENTRE_MID_Y - stackHeight / 2;
  return heights.map((height) => {
    const rect = { x, y, width: geometry.nodeWidth, height };
    y += height + SLOT_GAP;
    return rect;
  });
}

const PLACERS: Record<
  FocusZone,
  (geometry: FocusGeometry, heights: ReadonlyArray<number>) => Array<FocusRect>
> = {
  parent: (geometry, heights) =>
    heights.map((height) => rectInRow(geometry, geometry.centreX, PARENT_Y, height)),
  siblings: placeSiblings,
  children: placeChildren,
  blockedBy: (geometry, heights) => stackColumn(geometry, geometry.leftColumnX, heights),
  blocking: (geometry, heights) => stackColumn(geometry, geometry.rightColumnX, heights),
};

const midX = (rect: FocusRect): number => rect.x + rect.width / 2;
const midY = (rect: FocusRect): number => rect.y + rect.height / 2;

function connectorsFor(
  zone: FocusZone,
  rects: ReadonlyArray<FocusRect>,
  geometry: FocusGeometry,
): Array<FocusConnectorViewModel> {
  const first = rects[0];
  const last = rects[rects.length - 1];
  if (first === undefined || last === undefined) return [];
  const line = (
    role: ConnectorRole,
    kind: ConnectorKind,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): FocusConnectorViewModel => ({ zone, role, kind, x1, y1, x2, y2 });
  const { centreX, centreMidX, nodeWidth } = geometry;
  const busIfMany = (bus: FocusConnectorViewModel) => (rects.length > 1 ? [bus] : []);
  switch (zone) {
    case "parent":
      return [
        line("trunk", "tree", centreMidX, CENTRE_Y, centreMidX, PARENT_Y + FOCUS_NODE_HEIGHT),
      ];
    case "children":
      return [
        line("trunk", "tree", centreMidX, CHILD_Y, centreMidX, CENTRE_Y + FOCUS_NODE_HEIGHT),
        ...busIfMany(line("bus", "tree", midX(first), CHILD_Y, midX(last), CHILD_Y)),
      ];
    case "siblings": {
      const hasLeft = siblingsOnLeft(rects.length) > 0;
      const hasRight = rects.length > siblingsOnLeft(rects.length);
      return [
        line(
          "trunk",
          "peer",
          hasLeft ? geometry.siblingLeftX + nodeWidth : centreMidX,
          SIBLING_MID_Y,
          hasRight ? geometry.siblingRightX : centreMidX,
          SIBLING_MID_Y,
        ),
      ];
    }
    case "blockedBy": {
      const innerX = geometry.leftColumnX + nodeWidth;
      return [
        line("trunk", "blocks", innerX, CENTRE_MID_Y, centreX, CENTRE_MID_Y),
        ...busIfMany(line("bus", "blocks", innerX, midY(first), innerX, midY(last))),
      ];
    }
    case "blocking":
      return [
        line(
          "trunk",
          "blocks",
          centreX + nodeWidth,
          CENTRE_MID_Y,
          geometry.rightColumnX,
          CENTRE_MID_Y,
        ),
        ...busIfMany(
          line(
            "bus",
            "blocks",
            geometry.rightColumnX,
            midY(first),
            geometry.rightColumnX,
            midY(last),
          ),
        ),
      ];
  }
}

function labelsFor(
  zone: FocusZone,
  rects: ReadonlyArray<FocusRect>,
  geometry: FocusGeometry,
): Array<FocusLabelViewModel> {
  const label = COLUMN_LABELS[zone];
  const first = rects[0];
  if (label === undefined || first === undefined) return [];
  return [{ zone, text: label.text, x: label.x(geometry), y: first.y - LABEL_GAP }];
}

function toFocusNode(
  issue: TodoIssue,
  openParentIds: ReadonlySet<string>,
  zone: FocusZone | null,
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
    flagged: openParentIds.has(issue.id),
    zone,
    ...rect,
  };
}

function placeZone(
  zone: FocusZone,
  capped: CappedZone,
  openParentIds: ReadonlySet<string>,
  geometry: FocusGeometry,
): PlacedZone {
  const items = zoneItems(capped);
  const rects = PLACERS[zone](geometry, items.map(itemHeight));
  const nodes: Array<FocusNodeViewModel> = [];
  const markers: Array<FocusMarkerViewModel> = [];
  items.forEach((item, position) => {
    const rect = rects[position]!;
    if (item.kind === "issue") nodes.push(toFocusNode(item.issue, openParentIds, zone, rect));
    else markers.push({ zone, hidden: item.hidden, ...rect });
  });
  return {
    nodes,
    markers,
    connectors: connectorsFor(zone, rects, geometry),
    labels: labelsFor(zone, rects, geometry),
  };
}

function openParentIdsOf(issues: ReadonlyArray<TodoIssue>): Set<string> {
  const ids = new Set<string>();
  for (const issue of issues) {
    if (issue.parentId !== null && !isClosedStatus(issue.status)) ids.add(issue.parentId);
  }
  return ids;
}

function centreRectOf(geometry: FocusGeometry): FocusRect {
  return {
    x: geometry.centreX,
    y: CENTRE_Y,
    width: geometry.nodeWidth,
    height: FOCUS_NODE_HEIGHT,
  };
}

export function buildFocusGraph(
  issues: ReadonlyArray<TodoIssue>,
  centreId: string,
  availableWidth = BASE_AVAILABLE_WIDTH,
): FocusGraph {
  const centre = issues.find((issue) => issue.id === centreId);
  if (centre === undefined) return EMPTY_FOCUS_GRAPH;
  const geometry = focusGeometryFor(availableWidth);
  const openParentIds = openParentIdsOf(issues);
  const neighbours = partitionNeighbours(issues, centre, new Set(issues.map((issue) => issue.id)));
  const placed = ZONE_RENDER_ORDER.map((zone) =>
    placeZone(zone, capZone(neighbours[zone], ZONE_SLOTS[zone]), openParentIds, geometry),
  );
  return {
    nodes: [
      toFocusNode(centre, openParentIds, null, centreRectOf(geometry)),
      ...placed.flatMap((zone) => zone.nodes),
    ],
    markers: placed.flatMap((zone) => zone.markers),
    connectors: placed.flatMap((zone) => zone.connectors),
    labels: placed.flatMap((zone) => zone.labels),
    layout: geometry.layout,
  };
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
