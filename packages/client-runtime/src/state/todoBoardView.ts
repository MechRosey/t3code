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

export const BOARD_COLUMN_ORDER = [
  "backlog",
  "read",
  "doing",
  "delegated",
  "blocked",
  "done",
  "cancelled",
] as const;

const BOARD_COLUMN_LABELS: Record<string, string> = {
  backlog: "Backlog",
  read: "Read",
  doing: "Doing",
  delegated: "Delegated",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const DELEGATED_CLOSED_CHILD_STATUSES: ReadonlySet<string> = new Set(["done", "cancelled"]);

function isDelegatedIssue(issue: TodoIssue, childrenByParent: Map<string, Array<TodoIssue>>) {
  if (issue.status !== "done") return false;
  const children = childrenByParent.get(issue.id);
  if (children === undefined) return false;
  return children.some((child) => !DELEGATED_CLOSED_CHILD_STATUSES.has(child.status));
}

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

export type BoardSectionBadgeState = "filled" | "hollow" | "ghost";

export interface BoardSectionBadge {
  readonly label: string;
  readonly state: BoardSectionBadgeState;
  readonly title: string;
}

function boardSectionBadge(label: string, content: boolean, marker: boolean): BoardSectionBadge {
  const state: BoardSectionBadgeState = content ? "filled" : marker ? "hollow" : "ghost";
  const stateText = content
    ? marker
      ? "done and recorded"
      : "written"
    : marker
      ? "marked complete, no content"
      : "not started";
  return { label, state, title: `${label}: ${stateText}` };
}

export function boardSectionBadges(issue: TodoIssue): ReadonlyArray<BoardSectionBadge> {
  const { sections } = issue;
  return [
    boardSectionBadge("B", sections.brief.content, false),
    boardSectionBadge("R", sections.reading.content, sections.reading.marker),
    boardSectionBadge("D", sections.doing.content, sections.doing.marker),
    boardSectionBadge("Log", sections.log.content, false),
  ];
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

const EPIC_MARKER_TAG = "epic";
const COMMON_TAG_QUICK_FILTER_CAP = 8;
const COMMON_TAG_RECENCY_HALF_LIFE_DAYS = 14;
const BOARD_SHORT_ID_LENGTH = 5;

export function parseTagSpec(spec: string): Array<string> {
  return spec
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

export function matchesTagSpec(tags: ReadonlyArray<string>, terms: ReadonlyArray<string>): boolean {
  if (terms.length === 0) return true;
  const lowered = tags.map((tag) => tag.toLowerCase());
  return terms.some((term) => lowered.includes(term.toLowerCase()));
}

export function matchesIssueFreeText(issue: TodoIssue, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  if (issue.tags.some((tag) => tag.toLowerCase().includes(needle))) return true;
  return issue.id.slice(0, BOARD_SHORT_ID_LENGTH).toLowerCase().includes(needle);
}

export function toggleTagSpecTerm(term: string, spec: string): string {
  const terms = parseTagSpec(spec);
  const lowered = term.toLowerCase();
  const next = terms.some((entry) => entry.toLowerCase() === lowered)
    ? terms.filter((entry) => entry.toLowerCase() !== lowered)
    : [...terms, term];
  return next.join(",");
}

export function isQuickFilterActive(
  label: string,
  uiState: { readonly tagSpec?: string | null; readonly query?: string },
): boolean {
  const needle = label.toLowerCase();
  if (parseTagSpec(uiState.tagSpec ?? "").some((term) => term.toLowerCase() === needle)) {
    return true;
  }
  const query = (uiState.query ?? "").trim().toLowerCase();
  return query.length > 0 && needle.includes(query);
}

export interface BoardEpicQuickFilter {
  readonly epic: string;
  readonly hue: number | null;
}

export function boardEpicQuickFilters(
  issues: ReadonlyArray<TodoIssue>,
): Array<BoardEpicQuickFilter> {
  const byEpic = new Map<string, BoardEpicQuickFilter>();
  for (const issue of issues) {
    if (!issue.tags.some((tag) => tag.toLowerCase() === EPIC_MARKER_TAG)) continue;
    if (issue.epic === null || issue.epic.length === 0) continue;
    if (byEpic.has(issue.epic)) continue;
    byEpic.set(issue.epic, { epic: issue.epic, hue: issue.rootHue });
  }
  return [...byEpic.values()];
}

export function boardCommonTagQuickFilters(issues: ReadonlyArray<TodoIssue>): Array<string> {
  const excluded = new Set<string>([EPIC_MARKER_TAG]);
  for (const epic of boardEpicQuickFilters(issues)) excluded.add(epic.epic.toLowerCase());
  const reference = issues.reduce((max, issue) => (issue.updated > max ? issue.updated : max), "");
  const referenceMs = Date.parse(reference);
  const scores = new Map<string, number>();
  for (const issue of issues) {
    const updatedMs = Date.parse(issue.updated);
    const ageDays =
      Number.isNaN(updatedMs) || Number.isNaN(referenceMs)
        ? null
        : Math.max(0, (referenceMs - updatedMs) / 86_400_000);
    const weight = 1 + (ageDays === null ? 0 : 2 ** (-ageDays / COMMON_TAG_RECENCY_HALF_LIFE_DAYS));
    for (const tag of issue.tags) {
      if (excluded.has(tag.toLowerCase())) continue;
      scores.set(tag, (scores.get(tag) ?? 0) + weight);
    }
  }
  return [...scores.entries()]
    .sort(
      ([leftTag, leftScore], [rightTag, rightScore]) =>
        rightScore - leftScore || leftTag.localeCompare(rightTag),
    )
    .slice(0, COMMON_TAG_QUICK_FILTER_CAP)
    .map(([tag]) => tag);
}

export function expandTagFilterAncestors(
  matched: ReadonlyArray<TodoIssue>,
  issuesById: Map<string, TodoIssue>,
): Array<TodoIssue> {
  const seen = new Set<string>();
  const expanded: Array<TodoIssue> = [];
  const addOnce = (issue: TodoIssue) => {
    if (seen.has(issue.id)) return;
    seen.add(issue.id);
    expanded.push(issue);
  };
  for (const issue of matched) addOnce(issue);
  for (const issue of matched) {
    let current = issue;
    while (current.parentId !== null) {
      const parent = issuesById.get(current.parentId);
      if (parent === undefined || seen.has(parent.id)) break;
      addOnce(parent);
      current = parent;
    }
  }
  return expanded;
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
  readonly badges: ReadonlyArray<BoardSectionBadge>;
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
  readonly epics: ReadonlyArray<BoardEpicQuickFilter>;
  readonly commonTags: ReadonlyArray<string>;
  readonly columns: ReadonlyArray<BoardColumnViewModel>;
}

export const EMPTY_BOARD_SNAPSHOT: TodoBoardSnapshot = { root: "", repoName: "", issues: [] };

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
    badges: boardSectionBadges(issue),
    parent: parent === null ? null : { id: parent.id, title: parent.title },
    blockedBy: blockerIds.flatMap((id) => {
      const blocker = issuesById.get(id);
      return blocker === undefined ? [] : [{ id: blocker.id, title: blocker.title }];
    }),
  };
}

export interface BoardFilterUiState {
  readonly tag?: string | null;
  readonly tagSpec?: string | null;
  readonly query?: string;
}

export function buildBoardViewModel(
  snapshot: TodoBoardSnapshot,
  uiState: { readonly tag: string | null; readonly sort: BoardSortOrder } & BoardFilterUiState,
): BoardViewModel {
  const issuesById = new Map(snapshot.issues.map((issue) => [issue.id, issue] as const));
  const blockedByIndex = buildBlockedByIndex(snapshot.issues);
  const childrenByParent = buildChildIssuesIndex(snapshot.issues);
  const specTerms = parseTagSpec(uiState.tagSpec ?? "");
  const visible = sortBoardIssues(
    expandTagFilterAncestors(
      filterIssuesByTag(snapshot.issues, uiState.tag).filter(
        (issue) =>
          matchesTagSpec(issue.tags, specTerms) && matchesIssueFreeText(issue, uiState.query ?? ""),
      ),
      issuesById,
    ),
    uiState.sort,
  );
  const grouped = new Map<string, Array<TodoIssue>>();
  for (const issue of visible) {
    const column = isDelegatedIssue(issue, childrenByParent) ? "delegated" : issue.status;
    const cards = grouped.get(column);
    if (cards === undefined) {
      grouped.set(column, [issue]);
    } else {
      cards.push(issue);
    }
  }
  const known: ReadonlyArray<string> = BOARD_COLUMN_ORDER;
  const extra = [...grouped.keys()]
    .filter((status) => !isBoardStatus(status) && status !== "delegated")
    .sort((left, right) => left.localeCompare(right));
  return {
    root: snapshot.root,
    repoName: snapshot.repoName,
    tags: boardTags(snapshot.issues),
    epics: boardEpicQuickFilters(snapshot.issues),
    commonTags: boardCommonTagQuickFilters(snapshot.issues),
    columns: [...known, ...extra].map((status) => ({
      status,
      label: BOARD_COLUMN_LABELS[status] ?? status,
      cards: (grouped.get(status) ?? []).map((issue) => toCard(issue, issuesById, blockedByIndex)),
    })),
  };
}

const ARCHIVE_CLOSED_STATUSES: ReadonlyArray<string> = ["done", "cancelled"];

const isArchiveClosedStatus = (status: string): boolean => ARCHIVE_CLOSED_STATUSES.includes(status);

function buildChildIssuesIndex(issues: ReadonlyArray<TodoIssue>): Map<string, Array<TodoIssue>> {
  const childrenByParent = new Map<string, Array<TodoIssue>>();
  for (const issue of issues) {
    if (issue.parentId === null) continue;
    const siblings = childrenByParent.get(issue.parentId);
    if (siblings === undefined) {
      childrenByParent.set(issue.parentId, [issue]);
    } else {
      siblings.push(issue);
    }
  }
  return childrenByParent;
}

function subtreeOf(
  root: TodoIssue,
  childrenByParent: Map<string, Array<TodoIssue>>,
): Array<TodoIssue> {
  const members: Array<TodoIssue> = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    members.push(current);
    const children = childrenByParent.get(current.id);
    if (children !== undefined) stack.push(...children);
  }
  return members;
}

export function boardArchiveEligibleSubtrees(issues: ReadonlyArray<TodoIssue>): Array<TodoIssue> {
  const childrenByParent = buildChildIssuesIndex(issues);
  return issues.filter((issue) =>
    subtreeOf(issue, childrenByParent).every((member) => isArchiveClosedStatus(member.status)),
  );
}

export function boardArchiveSweepCandidates(issues: ReadonlyArray<TodoIssue>): Array<TodoIssue> {
  return boardArchiveEligibleSubtrees(issues).filter((issue) => issue.depth === 0);
}

export { isBoardSortOrder };
