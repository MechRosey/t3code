import type { TodoIssue } from "@t3tools/contracts";
import { joinSequenceEntry, sequenceEntryIds } from "@t3tools/shared/todoSequence";

import { shortBoardId } from "./boardCopy.logic";
import type { BoardDropSpeed } from "./boardDrop.logic";

export const SEQUENCE_STRIP_DROP_ID = "sequence:strip";
const SEQUENCE_CHIP_DRAG_PREFIX = "seq:";
const BOARD_CARD_DRAG_PREFIX = "card:";
const OUTSIDE_SEQUENCE_STATUSES: ReadonlySet<string> = new Set(["done", "cancelled"]);
const NO_EPIC_KEY = "";
const JOIN_ZONE_START_FRACTION = 1 / 3;
const JOIN_ZONE_END_FRACTION = 2 / 3;

export interface SequenceChip {
  readonly id: string;
  readonly shortId: string;
  readonly title: string;
  readonly status: string;
  readonly matches: boolean;
}

export interface SequenceSlot {
  readonly chips: ReadonlyArray<SequenceChip>;
}

export interface SequenceStrip {
  readonly next: ReadonlyArray<SequenceSlot>;
}

export interface DropRect {
  readonly left: number;
  readonly width: number;
}

export type ChipDropZone = "before" | "join" | "after";

export type SequencePlacement =
  | { readonly kind: "join"; readonly targetId: string }
  | { readonly kind: "insert"; readonly index: number };

export interface BoardSequenceSource {
  readonly sequence: ReadonlyArray<string>;
  readonly epicSequences?: Readonly<Record<string, ReadonlyArray<string>>>;
}

export interface ActiveSequence {
  readonly epic: string | null;
  readonly ids: ReadonlyArray<string>;
  readonly writable: boolean;
}

export type PendingWritesByEpic = Readonly<Record<string, ReadonlyArray<PendingSequenceWrite>>>;

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
const NO_SEQUENCE_CHANGE: SequenceDropOutcome = { kind: "sequence", ids: null };

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
  const shown = new Set<string>();
  const slotChips = (entry: string) =>
    sequenceEntryIds(entry).flatMap((id) => {
      const issue = issuesById.get(id);
      if (issue === undefined || !isSequenceCandidate(issue) || shown.has(id)) return [];
      shown.add(id);
      return [toChip(issue, matches)];
    });
  const next = sequence.flatMap((entry) => {
    const chips = slotChips(entry);
    return chips.length === 0 ? [] : [{ chips }];
  });
  return { next };
}

export function activeSequence(source: BoardSequenceSource, epicFilter: string): ActiveSequence {
  if (epicFilter === "") return { epic: null, ids: source.sequence, writable: true };
  if (source.epicSequences === undefined) {
    return { epic: null, ids: source.sequence, writable: false };
  }
  const needle = epicFilter.toLowerCase();
  const epic = Object.keys(source.epicSequences).find((name) => name.toLowerCase() === needle);
  if (epic === undefined) return { epic: null, ids: [], writable: false };
  return { epic, ids: source.epicSequences[epic] ?? [], writable: true };
}

const sameOrder = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

const changedOrNull = (next: ReadonlyArray<string>, current: ReadonlyArray<string>) =>
  sameOrder(next, current) ? null : next;

export function classifyDrop(draggedCentreX: number, target: DropRect): ChipDropZone {
  const fraction = (draggedCentreX - target.left) / target.width;
  if (fraction < JOIN_ZONE_START_FRACTION) return "before";
  return fraction < JOIN_ZONE_END_FRACTION ? "join" : "after";
}

export function chipDropZone(
  draggedRect: DropRect | null,
  overRect: DropRect | null,
): ChipDropZone {
  if (draggedRect === null || overRect === null) return "before";
  return classifyDrop(draggedRect.left + draggedRect.width / 2, overRect);
}

const entryIndexOf = (sequence: ReadonlyArray<string>, id: string) =>
  sequence.findIndex((entry) => sequenceEntryIds(entry).includes(id));

const isNoopJoin = (sequence: ReadonlyArray<string>, id: string, targetId: string) => {
  const targetIndex = entryIndexOf(sequence, targetId);
  return targetIndex < 0 || targetIndex === entryIndexOf(sequence, id);
};

export function placeInSequence(
  sequence: ReadonlyArray<string>,
  id: string,
  placement: SequencePlacement,
): ReadonlyArray<string> {
  if (placement.kind === "join" && isNoopJoin(sequence, id, placement.targetId)) return sequence;
  const insertIndex =
    placement.kind === "insert" ? Math.min(placement.index, sequence.length) : null;
  const seen = new Set([id]);
  const claimFirstSighting = (member: string) => {
    if (seen.has(member)) return false;
    seen.add(member);
    return true;
  };
  const placed: Array<string> = [];
  sequence.forEach((entry, index) => {
    if (index === insertIndex) placed.push(id);
    const kept = sequenceEntryIds(entry).filter(claimFirstSighting);
    if (placement.kind === "join" && kept.includes(placement.targetId)) kept.push(id);
    if (kept.length > 0) placed.push(joinSequenceEntry(kept));
  });
  if (insertIndex === sequence.length) placed.push(id);
  return placed;
}

function sequencePlacement(
  sequence: ReadonlyArray<string>,
  overId: string,
  zone: ChipDropZone,
): SequencePlacement | null {
  if (overId === SEQUENCE_STRIP_DROP_ID) return { kind: "insert", index: sequence.length };
  if (!isSequenceChipDragId(overId)) return null;
  const targetId = overId.slice(SEQUENCE_CHIP_DRAG_PREFIX.length);
  if (zone === "join") return { kind: "join", targetId };
  const index = entryIndexOf(sequence, targetId);
  if (index < 0) return null;
  return { kind: "insert", index: zone === "before" ? index : index + 1 };
}

interface SequenceDropInput {
  readonly activeId: string;
  readonly overId: string;
  readonly sequence: ReadonlyArray<string>;
  readonly writable: boolean;
  readonly issuesById: ReadonlyMap<string, TodoIssue>;
  readonly draggedRect: DropRect | null;
  readonly overRect: DropRect | null;
}

function draggedSequenceId(
  activeId: string,
  issuesById: ReadonlyMap<string, TodoIssue>,
): string | null {
  if (isSequenceChipDragId(activeId)) return activeId.slice(SEQUENCE_CHIP_DRAG_PREFIX.length);
  const cardId = boardCardIssueId(activeId);
  const issue = cardId === null ? undefined : issuesById.get(cardId);
  return issue !== undefined && isSequenceCandidate(issue) ? issue.id : null;
}

export function resolveSequenceDrop({
  activeId,
  overId,
  sequence,
  writable,
  issuesById,
  draggedRect,
  overRect,
}: SequenceDropInput): SequenceDropOutcome {
  if (!writable || !isSequenceDropId(overId)) {
    return isSequenceChipDragId(activeId) ? NO_SEQUENCE_CHANGE : BOARD_DROP;
  }
  const id = draggedSequenceId(activeId, issuesById);
  const placement = sequencePlacement(sequence, overId, chipDropZone(draggedRect, overRect));
  if (id === null || placement === null) return NO_SEQUENCE_CHANGE;
  return {
    kind: "sequence",
    ids: changedOrNull(placeInSequence(sequence, id, placement), sequence),
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

export function resolveBoardDragEnd(input: SequenceDropInput): BoardDragOutcome {
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
  return sequence.flatMap((entry) => {
    const kept = sequenceEntryIds(entry).filter((member) => member !== id);
    return kept.length === 0 ? [] : [joinSequenceEntry(kept)];
  });
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
  const caughtUp = writes.findLastIndex(
    (write, index) =>
      sameOrder(write.ids, snapshotSequence) &&
      writes.slice(0, index + 1).every((earlier) => earlier.settled),
  );
  const rebase = (write: PendingSequenceWrite) =>
    write.base === snapshotSequence ? write : { ...write, base: snapshotSequence };
  if (caughtUp >= 0) return writes.slice(caughtUp + 1).map(rebase);
  const kept = writes
    .filter((write) => !write.settled || write.base === snapshotSequence)
    .map((write) => (write.settled ? write : rebase(write)));
  const unchanged = kept.length === writes.length && kept.every((write, i) => write === writes[i]);
  return unchanged ? writes : kept;
}

const NO_PENDING_WRITES: ReadonlyArray<PendingSequenceWrite> = [];

export const pendingWritesFor = (
  byEpic: PendingWritesByEpic,
  epic: string | null,
): ReadonlyArray<PendingSequenceWrite> => byEpic[epic ?? NO_EPIC_KEY] ?? NO_PENDING_WRITES;

export const pendingWritesForActive = (
  byEpic: PendingWritesByEpic,
  active: ActiveSequence,
): ReadonlyArray<PendingSequenceWrite> =>
  active.writable ? pendingWritesFor(byEpic, active.epic) : NO_PENDING_WRITES;

export const withPendingWrites = (
  byEpic: PendingWritesByEpic,
  epic: string | null,
  writes: ReadonlyArray<PendingSequenceWrite>,
): PendingWritesByEpic => ({ ...byEpic, [epic ?? NO_EPIC_KEY]: writes });

export function displayedSequence(
  snapshotSequence: ReadonlyArray<string>,
  writes: ReadonlyArray<PendingSequenceWrite>,
): ReadonlyArray<string> {
  return writes.at(-1)?.ids ?? snapshotSequence;
}
