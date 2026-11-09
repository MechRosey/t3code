import { arrayMove } from "@dnd-kit/sortable";
import type { TodoIssue } from "@t3tools/contracts";
import { sortBoardIssues } from "@t3tools/client-runtime/state/todo-board-view";

import { shortBoardId } from "./boardCopy.logic";
import type { BoardDropSpeed } from "./boardDrop.logic";

export const SEQUENCE_STRIP_DROP_ID = "sequence:strip";
const SEQUENCE_CHIP_DRAG_PREFIX = "seq:";
const BOARD_CARD_DRAG_PREFIX = "card:";
const DOING_STATUS = "doing";
const OUTSIDE_SEQUENCE_STATUSES: ReadonlySet<string> = new Set([DOING_STATUS, "done", "cancelled"]);

export interface SequenceChip {
  readonly id: string;
  readonly shortId: string;
  readonly title: string;
  readonly status: string;
  readonly matches: boolean;
}

export interface SequenceStrip {
  readonly doing: ReadonlyArray<SequenceChip>;
  readonly next: ReadonlyArray<SequenceChip>;
}

export interface PendingSequenceWrite {
  readonly token: number;
  readonly ids: ReadonlyArray<string>;
  readonly base: ReadonlyArray<string>;
  readonly settled: boolean;
}

export type SequenceDropOutcome =
  | { readonly kind: "board" }
  | { readonly kind: "sequence"; readonly ids: ReadonlyArray<string> | null };

const BOARD_DROP: SequenceDropOutcome = { kind: "board" };

export const sequenceChipDragId = (id: string) => `${SEQUENCE_CHIP_DRAG_PREFIX}${id}`;

export const boardCardDragId = (issueId: string) => `${BOARD_CARD_DRAG_PREFIX}${issueId}`;

export const boardCardIssueId = (dragId: string): string | null =>
  dragId.startsWith(BOARD_CARD_DRAG_PREFIX) ? dragId.slice(BOARD_CARD_DRAG_PREFIX.length) : null;

export const isSequenceChipDragId = (dragId: string) =>
  dragId.startsWith(SEQUENCE_CHIP_DRAG_PREFIX);

export const isSequenceDropId = (dropId: string) =>
  dropId === SEQUENCE_STRIP_DROP_ID || isSequenceChipDragId(dropId);

const isSequenceCandidate = (issue: TodoIssue) =>
  !issue.archived && !OUTSIDE_SEQUENCE_STATUSES.has(issue.status);

const toChip = (issue: TodoIssue, matches: (issue: TodoIssue) => boolean): SequenceChip => ({
  id: issue.id,
  shortId: shortBoardId(issue.id),
  title: issue.title,
  status: issue.status,
  matches: matches(issue),
});

export function buildSequenceStrip(
  issues: ReadonlyArray<TodoIssue>,
  sequence: ReadonlyArray<string>,
  matches: (issue: TodoIssue) => boolean,
): SequenceStrip {
  const issuesById = new Map(issues.map((issue) => [issue.id, issue] as const));
  const doing = sortBoardIssues(
    issues.filter((issue) => !issue.archived && issue.status === DOING_STATUS),
    "updated-desc",
  );
  const next = sequence.flatMap((id) => {
    const issue = issuesById.get(id);
    return issue !== undefined && isSequenceCandidate(issue) ? [issue] : [];
  });
  return {
    doing: doing.map((issue) => toChip(issue, matches)),
    next: next.map((issue) => toChip(issue, matches)),
  };
}

const sameOrder = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

const changedOrNull = (next: ReadonlyArray<string>, current: ReadonlyArray<string>) =>
  sameOrder(next, current) ? null : next;

function sequenceDropBeforeId(overId: string): { readonly beforeId: string | null } | null {
  if (overId === SEQUENCE_STRIP_DROP_ID) return { beforeId: null };
  if (isSequenceChipDragId(overId)) {
    return { beforeId: overId.slice(SEQUENCE_CHIP_DRAG_PREFIX.length) };
  }
  return null;
}

function placeCardInSequence(
  sequence: ReadonlyArray<string>,
  issue: TodoIssue,
  beforeId: string | null,
): ReadonlyArray<string> | null {
  if (!isSequenceCandidate(issue) || issue.id === beforeId) return null;
  const without = sequence.filter((id) => id !== issue.id);
  const index = beforeId === null ? -1 : without.indexOf(beforeId);
  const placed =
    index < 0
      ? [...without, issue.id]
      : [...without.slice(0, index), issue.id, ...without.slice(index)];
  return changedOrNull(placed, sequence);
}

function reorderSequenceChip(
  sequence: ReadonlyArray<string>,
  nextIds: ReadonlyArray<string>,
  activeId: string,
  overId: string | null,
): ReadonlyArray<string> | null {
  const from = nextIds.indexOf(activeId);
  const to = overId === null ? nextIds.length - 1 : nextIds.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return null;
  const reordered = arrayMove([...nextIds], from, to);
  const nextSlots = new Set(nextIds);
  let slot = 0;
  return sequence.map((id) => (nextSlots.has(id) ? (reordered[slot++] ?? id) : id));
}

export function resolveSequenceDrop({
  activeId,
  overId,
  sequence,
  strip,
  issuesById,
}: {
  readonly activeId: string;
  readonly overId: string;
  readonly sequence: ReadonlyArray<string>;
  readonly strip: SequenceStrip;
  readonly issuesById: ReadonlyMap<string, TodoIssue>;
}): SequenceDropOutcome {
  const target = sequenceDropBeforeId(overId);
  if (isSequenceChipDragId(activeId)) {
    const chipId = activeId.slice(SEQUENCE_CHIP_DRAG_PREFIX.length);
    const nextIds = strip.next.map((chip) => chip.id);
    return {
      kind: "sequence",
      ids: target === null ? null : reorderSequenceChip(sequence, nextIds, chipId, target.beforeId),
    };
  }
  if (target === null) return BOARD_DROP;
  const cardId = boardCardIssueId(activeId);
  const issue = cardId === null ? undefined : issuesById.get(cardId);
  return {
    kind: "sequence",
    ids: issue === undefined ? null : placeCardInSequence(sequence, issue, target.beforeId),
  };
}

export type BoardDragOutcome =
  | { readonly kind: "ignore" }
  | { readonly kind: "sequence"; readonly ids: ReadonlyArray<string> }
  | {
      readonly kind: "column";
      readonly issue: TodoIssue;
      readonly target: string;
      readonly speed: BoardDropSpeed;
    };

const COLUMN_DROP_TARGETS: ReadonlyArray<{
  readonly prefix: string;
  readonly speed: BoardDropSpeed;
}> = [
  { prefix: "column:", speed: "confirm" },
  { prefix: "dispatch:", speed: "now" },
  { prefix: "force:", speed: "force" },
];

export function resolveBoardDragEnd(input: {
  readonly activeId: string;
  readonly overId: string;
  readonly sequence: ReadonlyArray<string>;
  readonly strip: SequenceStrip;
  readonly issuesById: ReadonlyMap<string, TodoIssue>;
}): BoardDragOutcome {
  const sequenceDrop = resolveSequenceDrop(input);
  if (sequenceDrop.kind === "sequence") {
    return sequenceDrop.ids === null
      ? { kind: "ignore" }
      : { kind: "sequence", ids: sequenceDrop.ids };
  }
  const cardId = boardCardIssueId(input.activeId);
  const issue = cardId === null ? undefined : input.issuesById.get(cardId);
  if (issue === undefined) return { kind: "ignore" };
  for (const { prefix, speed } of COLUMN_DROP_TARGETS) {
    if (input.overId.startsWith(prefix)) {
      return { kind: "column", issue, target: input.overId.slice(prefix.length), speed };
    }
  }
  return { kind: "ignore" };
}

export function removeFromSequence(
  sequence: ReadonlyArray<string>,
  id: string,
): ReadonlyArray<string> {
  return sequence.filter((entry) => entry !== id);
}

export const startPendingWrite = (
  writes: ReadonlyArray<PendingSequenceWrite>,
  write: Omit<PendingSequenceWrite, "settled">,
): ReadonlyArray<PendingSequenceWrite> => [...writes, { ...write, settled: false }];

export const settlePendingWrite = (
  writes: ReadonlyArray<PendingSequenceWrite>,
  token: number,
  ids: ReadonlyArray<string>,
): ReadonlyArray<PendingSequenceWrite> =>
  writes.map((write) => (write.token === token ? { ...write, ids, settled: true } : write));

export const failPendingWrite = (
  writes: ReadonlyArray<PendingSequenceWrite>,
  token: number,
): ReadonlyArray<PendingSequenceWrite> => writes.filter((write) => write.token !== token);

export function reconcilePendingWrites(
  writes: ReadonlyArray<PendingSequenceWrite>,
  snapshotSequence: ReadonlyArray<string>,
): ReadonlyArray<PendingSequenceWrite> {
  const caughtUp = writes.findLastIndex((write) => sameOrder(write.ids, snapshotSequence));
  if (caughtUp >= 0) {
    return writes
      .slice(caughtUp + 1)
      .map((write) =>
        write.base === snapshotSequence ? write : { ...write, base: snapshotSequence },
      );
  }
  const kept = writes.filter((write) => !write.settled || write.base === snapshotSequence);
  return kept.length === writes.length ? writes : kept;
}

export function displayedSequence(
  snapshotSequence: ReadonlyArray<string>,
  writes: ReadonlyArray<PendingSequenceWrite>,
): ReadonlyArray<string> {
  return writes.at(-1)?.ids ?? snapshotSequence;
}
