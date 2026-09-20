import type { TodoBoardSnapshot, TodoIssue } from "@t3tools/contracts";

export const BOARD_STATUS_ORDER = [
  "backlog",
  "read",
  "doing",
  "blocked",
  "done",
  "cancelled",
] as const;
export type BoardStatus = (typeof BOARD_STATUS_ORDER)[number];

const BOARD_STATUS_LABELS: Record<BoardStatus, string> = {
  backlog: "Backlog",
  doing: "Doing",
  read: "Read",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export const BOARD_STATUS_GLYPHS: Record<BoardStatus, string> = {
  backlog: "○",
  read: "◐",
  doing: "▶",
  blocked: "⛔",
  done: "✓",
  cancelled: "✕",
};

export const BOARD_STATUS_COLOUR_CLASSES: Record<BoardStatus, string> = {
  backlog: "text-muted-foreground",
  read: "text-info",
  doing: "text-primary",
  blocked: "text-error",
  done: "text-success",
  cancelled: "text-muted-foreground",
};

const isBoardStatus = (status: string): status is BoardStatus =>
  (BOARD_STATUS_ORDER as readonly string[]).includes(status);

export function boardStatusLabel(status: string): string {
  return isBoardStatus(status) ? BOARD_STATUS_LABELS[status] : status;
}

export function boardStatusGlyph(status: string): string {
  return isBoardStatus(status) ? BOARD_STATUS_GLYPHS[status] : BOARD_STATUS_GLYPHS.backlog;
}

export function boardStatusColourClass(status: string): string {
  return isBoardStatus(status)
    ? BOARD_STATUS_COLOUR_CLASSES[status]
    : BOARD_STATUS_COLOUR_CLASSES.backlog;
}

export const BOARD_SORT_OPTIONS = [
  { value: "updated-desc", label: "Recently updated" },
  { value: "created-desc", label: "Newest first" },
  { value: "created-asc", label: "Oldest first" },
  { value: "id-asc", label: "Ticket id" },
] as const;
export type BoardSortOrder = (typeof BOARD_SORT_OPTIONS)[number]["value"];

const isBoardSortOrder = (value: string): value is BoardSortOrder =>
  BOARD_SORT_OPTIONS.some((option) => option.value === value);

export type BoardQuestionBadge = "human" | "open" | null;

export function boardQuestionBadge(issue: TodoIssue): BoardQuestionBadge {
  if (issue.sections.openQuestions.hasHumanOpen) return "human";
  if (issue.sections.openQuestions.hasOpen) return "open";
  return null;
}

export function boardTags(issues: ReadonlyArray<TodoIssue>): Array<string> {
  const tags = new Set<string>();
  for (const issue of issues) {
    for (const tag of issue.tags) tags.add(tag);
  }
  return [...tags].sort((left, right) => left.localeCompare(right));
}

export function filterIssuesByTag(
  issues: ReadonlyArray<TodoIssue>,
  tag: string | null,
): Array<TodoIssue> {
  if (tag === null) return [...issues];
  return issues.filter((issue) => issue.tags.includes(tag));
}

export function sortBoardIssues(
  issues: ReadonlyArray<TodoIssue>,
  order: BoardSortOrder,
): Array<TodoIssue> {
  const comparators: Record<BoardSortOrder, (left: TodoIssue, right: TodoIssue) => number> = {
    "updated-desc": (left, right) =>
      right.updated.localeCompare(left.updated) || left.id.localeCompare(right.id),
    "created-desc": (left, right) =>
      right.created.localeCompare(left.created) || left.id.localeCompare(right.id),
    "created-asc": (left, right) =>
      left.created.localeCompare(right.created) || left.id.localeCompare(right.id),
    "id-asc": (left, right) => left.id.localeCompare(right.id),
  };
  const compare = comparators[order];
  return [...issues].sort(compare);
}

export function buildBlockedByIndex(issues: ReadonlyArray<TodoIssue>): Map<string, Array<string>> {
  const blockedBy = new Map<string, Array<string>>();
  for (const issue of issues) {
    for (const target of issue.links.blocks) {
      const blockers = blockedBy.get(target);
      if (blockers === undefined) {
        blockedBy.set(target, [issue.id]);
      } else if (!blockers.includes(issue.id)) {
        blockers.push(issue.id);
      }
    }
  }
  return blockedBy;
}

export interface BoardCardViewModel {
  readonly issue: TodoIssue;
  readonly isRoot: boolean;
  readonly hue: number | null;
  readonly tinted: boolean;
  readonly glyph: string;
  readonly statusLabel: string;
  readonly colourClass: string;
  readonly badge: BoardQuestionBadge;
  readonly parent: { readonly id: string; readonly title: string } | null;
  readonly blockedBy: ReadonlyArray<{ readonly id: string; readonly title: string }>;
}

export interface BoardColumnViewModel {
  readonly status: string;
  readonly label: string;
  readonly cards: ReadonlyArray<BoardCardViewModel>;
}

export interface BoardViewModel {
  readonly root: string;
  readonly repoName: string;
  readonly tags: ReadonlyArray<string>;
  readonly columns: ReadonlyArray<BoardColumnViewModel>;
}

export function cardHueStyle(issue: TodoIssue): Record<string, string> {
  return issue.rootHue === null ? {} : { "--card-hue": String(issue.rootHue) };
}

function toCard(
  issue: TodoIssue,
  issuesById: Map<string, TodoIssue>,
  blockedByIndex: Map<string, Array<string>>,
): BoardCardViewModel {
  const blockerIds = blockedByIndex.get(issue.id) ?? [];
  const parent = issue.parentId === null ? null : (issuesById.get(issue.parentId) ?? null);
  return {
    issue,
    isRoot: issue.parentId === null,
    hue: issue.rootHue,
    tinted: issue.rootHue !== null && issue.status !== "blocked",
    glyph: boardStatusGlyph(issue.status),
    statusLabel: boardStatusLabel(issue.status),
    colourClass: boardStatusColourClass(issue.status),
    badge: boardQuestionBadge(issue),
    parent: parent === null ? null : { id: parent.id, title: parent.title },
    blockedBy: blockerIds.flatMap((id) => {
      const blocker = issuesById.get(id);
      return blocker === undefined ? [] : [{ id: blocker.id, title: blocker.title }];
    }),
  };
}

export function buildBoardViewModel(
  snapshot: TodoBoardSnapshot,
  uiState: { readonly tag: string | null; readonly sort: BoardSortOrder },
): BoardViewModel {
  const issuesById = new Map(snapshot.issues.map((issue) => [issue.id, issue] as const));
  const blockedByIndex = buildBlockedByIndex(snapshot.issues);
  const visible = sortBoardIssues(filterIssuesByTag(snapshot.issues, uiState.tag), uiState.sort);
  const grouped = new Map<string, Array<TodoIssue>>();
  for (const issue of visible) {
    const column = grouped.get(issue.status);
    if (column === undefined) {
      grouped.set(issue.status, [issue]);
    } else {
      column.push(issue);
    }
  }
  const known: ReadonlyArray<string> = BOARD_STATUS_ORDER;
  const extra = [...grouped.keys()]
    .filter((status) => !isBoardStatus(status))
    .sort((left, right) => left.localeCompare(right));
  return {
    root: snapshot.root,
    repoName: snapshot.repoName,
    tags: boardTags(snapshot.issues),
    columns: [...known, ...extra].map((status) => ({
      status,
      label: boardStatusLabel(status),
      cards: (grouped.get(status) ?? []).map((issue) => toCard(issue, issuesById, blockedByIndex)),
    })),
  };
}

export { isBoardSortOrder };
