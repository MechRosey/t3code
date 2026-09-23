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
