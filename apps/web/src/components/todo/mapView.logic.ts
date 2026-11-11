import type { TodoIssue } from "@t3tools/contracts";

import {
  BOARD_STATUS_ORDER,
  boardQuestionBadge,
  boardStatusColourClass,
  boardStatusGlyph,
  boardStatusLabel,
  isClosedStatus,
  type BoardQuestionBadge,
} from "@t3tools/client-runtime/state/todo-board-view";

export type FocusZone = "parent" | "siblings" | "children" | "blockedBy" | "blocking";

type ConnectorKind = "tree" | "blocks" | "peer";

type ConnectorRole = "trunk" | "bus";

const BASE_AVAILABLE_WIDTH = 420;
export const TEXT_INSET_X = 6;
const AVAILABLE_WIDTH_STEP = 8;
const MIN_NODE_WIDTH = 76;
const MAX_NODE_WIDTH = 144;
const TITLE_CHAR_WIDTH = 5.3;
const FOCUS_NODE_HEIGHT = 46;
const OVERFLOW_LABEL_DROP = 12;
const OVERFLOW_LABEL_DESCENT = 3;
const SLOT_GAP = 6;
const COLUMN_GAP = 14;
const ROW_GAP = 28;
const LABEL_GAP = 6;

const SIDE_COLUMN_SLOTS = 4;
const PARENT_SLOTS = 1;

interface RelationTier {
  readonly childSlots: number;
  readonly siblingsPerSide: number;
  readonly blockNodeUnits: number;
  readonly blockSlotGaps: number;
}

const RELATION_TIERS: ReadonlyArray<RelationTier> = [
  { childSlots: 3, siblingsPerSide: 1, blockNodeUnits: 3, blockSlotGaps: 2 },
  { childSlots: 4, siblingsPerSide: 1, blockNodeUnits: 4, blockSlotGaps: 3 },
  { childSlots: 4, siblingsPerSide: 2, blockNodeUnits: 4.5, blockSlotGaps: 4 },
  { childSlots: 5, siblingsPerSide: 2, blockNodeUnits: 5, blockSlotGaps: 4 },
];

const PARENT_Y = 0;
const SIBLING_Y = PARENT_Y + FOCUS_NODE_HEIGHT + ROW_GAP;
const SIBLING_BOTTOM_Y = SIBLING_Y + FOCUS_NODE_HEIGHT;
const SIBLING_MID_Y = SIBLING_Y + FOCUS_NODE_HEIGHT / 2;
const SIBLING_CENTRE_OVERLAP = FOCUS_NODE_HEIGHT / 4;
const SIBLING_CENTRE_CLEARANCE_X = SLOT_GAP;
const SIBLING_CENTRE_CLEARANCE_Y = 10;

const COLUMN_HEIGHT = SIDE_COLUMN_SLOTS * FOCUS_NODE_HEIGHT + (SIDE_COLUMN_SLOTS - 1) * SLOT_GAP;

interface FocusRows {
  readonly centreY: number;
  readonly centreMidY: number;
  readonly childY: number;
  readonly gridHeight: number;
}

function focusRowsFor(siblingsToCentreGapX: number): FocusRows {
  const centreY =
    siblingsToCentreGapX >= SIBLING_CENTRE_CLEARANCE_X
      ? SIBLING_BOTTOM_Y - SIBLING_CENTRE_OVERLAP
      : SIBLING_BOTTOM_Y + SIBLING_CENTRE_CLEARANCE_Y;
  const centreMidY = centreY + FOCUS_NODE_HEIGHT / 2;
  const childY = centreY + FOCUS_NODE_HEIGHT + ROW_GAP;
  const columnTop = centreMidY - COLUMN_HEIGHT / 2;
  return {
    centreY,
    centreMidY,
    childY,
    gridHeight: Math.max(childY + FOCUS_NODE_HEIGHT, columnTop + COLUMN_HEIGHT),
  };
}

interface FocusGeometry {
  readonly tier: RelationTier;
  readonly nodeWidth: number;
  readonly slotPitch: number;
  readonly blockWidth: number;
  readonly blockX: number;
  readonly leftColumnX: number;
  readonly rightColumnX: number;
  readonly siblingGapLeftX: number;
  readonly siblingGapRightX: number;
  readonly centreX: number;
  readonly centreMidX: number;
  readonly rows: FocusRows;
  readonly layout: MapLayout;
}

const usableWidthOf = (availableWidth: number): number =>
  Number.isFinite(availableWidth) && availableWidth > 0 ? availableWidth : 0;

const gridFixedWidthOf = (tier: RelationTier): number =>
  2 * COLUMN_GAP + tier.blockSlotGaps * SLOT_GAP;

const gridNodeColumnsOf = (tier: RelationTier): number => 2 + tier.blockNodeUnits;

const gridWidthAt = (tier: RelationTier, nodeWidth: number): number =>
  gridNodeColumnsOf(tier) * nodeWidth + gridFixedWidthOf(tier);

function tierFor(availableWidth: number): RelationTier {
  const fitting = RELATION_TIERS.filter(
    (tier) => gridWidthAt(tier, MIN_NODE_WIDTH) <= availableWidth,
  );
  return fitting.at(-1) ?? RELATION_TIERS[0]!;
}

function nodeWidthFor(tier: RelationTier, availableWidth: number): number {
  const fitted = Math.floor((availableWidth - gridFixedWidthOf(tier)) / gridNodeColumnsOf(tier));
  return Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, fitted));
}

export const snapAvailableWidth = (width: number): number =>
  Math.floor(width / AVAILABLE_WIDTH_STEP) * AVAILABLE_WIDTH_STEP;

function titleCharsFor(nodeWidth: number): number {
  return Math.floor((nodeWidth - 2 * TEXT_INSET_X) / TITLE_CHAR_WIDTH);
}

function focusGeometryFor(availableWidth: number): FocusGeometry {
  const usableWidth = usableWidthOf(availableWidth);
  const tier = tierFor(usableWidth);
  const nodeWidth = nodeWidthFor(tier, usableWidth);
  const slotPitch = nodeWidth + SLOT_GAP;
  const blockWidth = tier.blockNodeUnits * nodeWidth + tier.blockSlotGaps * SLOT_GAP;
  const sideWidth = tier.siblingsPerSide * slotPitch - SLOT_GAP;
  const leftColumnX = 0;
  const blockX = leftColumnX + nodeWidth + COLUMN_GAP;
  const rightColumnX = blockX + blockWidth + COLUMN_GAP;
  const centreX = blockX + (blockWidth - nodeWidth) / 2;
  const siblingGapLeftX = blockX + sideWidth;
  const rows = focusRowsFor(centreX - siblingGapLeftX);
  return {
    tier,
    nodeWidth,
    slotPitch,
    blockWidth,
    blockX,
    leftColumnX,
    rightColumnX,
    siblingGapLeftX,
    siblingGapRightX: blockX + blockWidth - sideWidth,
    centreX,
    centreMidX: centreX + nodeWidth / 2,
    rows,
    layout: {
      width: rightColumnX + nodeWidth,
      height: rows.gridHeight,
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

const zoneSlotsFor = (tier: RelationTier): Record<FocusZone, number> => ({
  parent: PARENT_SLOTS,
  siblings: 2 * tier.siblingsPerSide,
  children: tier.childSlots,
  blockedBy: SIDE_COLUMN_SLOTS,
  blocking: SIDE_COLUMN_SLOTS,
});

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

export interface FocusOverflowViewModel {
  readonly zone: FocusZone;
  readonly hidden: number;
  readonly text: string;
  readonly x: number;
  readonly y: number;
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
  readonly overflows: ReadonlyArray<FocusOverflowViewModel>;
  readonly connectors: ReadonlyArray<FocusConnectorViewModel>;
  readonly labels: ReadonlyArray<FocusLabelViewModel>;
  readonly layout: MapLayout;
}

interface CappedZone {
  readonly shown: ReadonlyArray<TodoIssue>;
  readonly hidden: number;
}

interface PlacedZone {
  readonly nodes: ReadonlyArray<FocusNodeViewModel>;
  readonly overflows: ReadonlyArray<FocusOverflowViewModel>;
  readonly connectors: ReadonlyArray<FocusConnectorViewModel>;
  readonly labels: ReadonlyArray<FocusLabelViewModel>;
}

const EMPTY_FOCUS_GRAPH: FocusGraph = {
  nodes: [],
  overflows: [],
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
  const closed = ranked.filter((issue) => isClosedStatus(issue.status));
  return {
    shown: [...open, ...closed].slice(0, slots),
    hidden: Math.max(0, open.length - slots),
  };
}

function rectInRow(geometry: FocusGeometry, x: number, rowY: number): FocusRect {
  return { x, y: rowY, width: geometry.nodeWidth, height: FOCUS_NODE_HEIGHT };
}

const siblingsOnLeft = (count: number): number => Math.floor(count / 2);

function placeSiblings(geometry: FocusGeometry, count: number): Array<FocusRect> {
  const leftCount = siblingsOnLeft(count);
  const leftEdgeX = geometry.siblingGapLeftX + SLOT_GAP - leftCount * geometry.slotPitch;
  return Array.from({ length: count }, (_, position) =>
    rectInRow(
      geometry,
      position < leftCount
        ? leftEdgeX + position * geometry.slotPitch
        : geometry.siblingGapRightX + (position - leftCount) * geometry.slotPitch,
      SIBLING_Y,
    ),
  );
}

function placeChildren(geometry: FocusGeometry, count: number): Array<FocusRect> {
  const rowWidth = count * geometry.slotPitch - SLOT_GAP;
  const rowX = geometry.blockX + (geometry.blockWidth - rowWidth) / 2;
  return Array.from({ length: count }, (_, position) =>
    rectInRow(geometry, rowX + position * geometry.slotPitch, geometry.rows.childY),
  );
}

function stackColumn(geometry: FocusGeometry, x: number, count: number): Array<FocusRect> {
  const stackHeight = count * FOCUS_NODE_HEIGHT + (count - 1) * SLOT_GAP;
  const top = geometry.rows.centreMidY - stackHeight / 2;
  return Array.from({ length: count }, (_, position) => ({
    x,
    y: top + position * (FOCUS_NODE_HEIGHT + SLOT_GAP),
    width: geometry.nodeWidth,
    height: FOCUS_NODE_HEIGHT,
  }));
}

const PLACERS: Record<FocusZone, (geometry: FocusGeometry, count: number) => Array<FocusRect>> = {
  parent: (geometry, count) =>
    Array.from({ length: count }, () => rectInRow(geometry, geometry.centreX, PARENT_Y)),
  siblings: placeSiblings,
  children: placeChildren,
  blockedBy: (geometry, count) => stackColumn(geometry, geometry.leftColumnX, count),
  blocking: (geometry, count) => stackColumn(geometry, geometry.rightColumnX, count),
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
  const { centreY, centreMidY, childY } = geometry.rows;
  const busIfMany = (bus: FocusConnectorViewModel) => (rects.length > 1 ? [bus] : []);
  switch (zone) {
    case "parent":
      return [line("trunk", "tree", centreMidX, centreY, centreMidX, PARENT_Y + FOCUS_NODE_HEIGHT)];
    case "children":
      return [
        line("trunk", "tree", centreMidX, childY, centreMidX, centreY + FOCUS_NODE_HEIGHT),
        ...busIfMany(line("bus", "tree", midX(first), childY, midX(last), childY)),
      ];
    case "siblings": {
      const leftCount = siblingsOnLeft(rects.length);
      return [
        line(
          "trunk",
          "peer",
          leftCount > 0 ? first.x + first.width : centreMidX,
          SIBLING_MID_Y,
          rects.length > leftCount ? last.x : centreMidX,
          SIBLING_MID_Y,
        ),
      ];
    }
    case "blockedBy": {
      const innerX = geometry.leftColumnX + nodeWidth;
      return [
        line("trunk", "blocks", innerX, centreMidY, centreX, centreMidY),
        ...busIfMany(line("bus", "blocks", innerX, midY(first), innerX, midY(last))),
      ];
    }
    case "blocking":
      return [
        line("trunk", "blocks", centreX + nodeWidth, centreMidY, geometry.rightColumnX, centreMidY),
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

const overflowLabelY = (zone: FocusZone, last: FocusRect): number =>
  zone === "siblings" ? last.y - LABEL_GAP : last.y + last.height + OVERFLOW_LABEL_DROP;

function overflowsFor(
  zone: FocusZone,
  hidden: number,
  rects: ReadonlyArray<FocusRect>,
): Array<FocusOverflowViewModel> {
  const last = rects.at(-1);
  if (hidden === 0 || last === undefined) return [];
  return [{ zone, hidden, text: `+${hidden} more`, x: midX(last), y: overflowLabelY(zone, last) }];
}

function placeZone(
  zone: FocusZone,
  capped: CappedZone,
  openParentIds: ReadonlySet<string>,
  geometry: FocusGeometry,
): PlacedZone {
  const rects = PLACERS[zone](geometry, capped.shown.length);
  return {
    nodes: capped.shown.map((issue, position) =>
      toFocusNode(issue, openParentIds, zone, rects[position]!),
    ),
    overflows: overflowsFor(zone, capped.hidden, rects),
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
    y: geometry.rows.centreY,
    width: geometry.nodeWidth,
    height: FOCUS_NODE_HEIGHT,
  };
}

function heightHolding(
  overflows: ReadonlyArray<FocusOverflowViewModel>,
  gridHeight: number,
): number {
  const lowestLabelBottom = Math.max(
    0,
    ...overflows.map((overflow) => overflow.y + OVERFLOW_LABEL_DESCENT),
  );
  return Math.max(gridHeight, lowestLabelBottom);
}

export function buildFocusGraph(
  issues: ReadonlyArray<TodoIssue>,
  centreId: string,
  availableWidth = BASE_AVAILABLE_WIDTH,
): FocusGraph {
  const centre = issues.find((issue) => issue.id === centreId);
  if (centre === undefined) return EMPTY_FOCUS_GRAPH;
  const geometry = focusGeometryFor(availableWidth);
  const zoneSlots = zoneSlotsFor(geometry.tier);
  const openParentIds = openParentIdsOf(issues);
  const neighbours = partitionNeighbours(issues, centre, new Set(issues.map((issue) => issue.id)));
  const placed = ZONE_RENDER_ORDER.map((zone) =>
    placeZone(zone, capZone(neighbours[zone], zoneSlots[zone]), openParentIds, geometry),
  );
  const overflows = placed.flatMap((zone) => zone.overflows);
  return {
    nodes: [
      toFocusNode(centre, openParentIds, null, centreRectOf(geometry)),
      ...placed.flatMap((zone) => zone.nodes),
    ],
    overflows,
    connectors: placed.flatMap((zone) => zone.connectors),
    labels: placed.flatMap((zone) => zone.labels),
    layout: { ...geometry.layout, height: heightHolding(overflows, geometry.rows.gridHeight) },
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
