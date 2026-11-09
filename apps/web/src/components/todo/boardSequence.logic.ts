import type { TodoIssue } from "@t3tools/contracts";

export const SEQUENCE_STRIP_DROP_ID = "sequence:strip";

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

export interface PendingSequence {
  readonly base: ReadonlyArray<string>;
  readonly ids: ReadonlyArray<string>;
}

export type SequenceDropOutcome =
  | { readonly kind: "board" }
  | { readonly kind: "sequence"; readonly ids: ReadonlyArray<string> | null };

export const sequenceChipDragId = (id: string) => id;

export function buildSequenceStrip(
  _issues: ReadonlyArray<TodoIssue>,
  _sequence: ReadonlyArray<string>,
  _matches: (issue: TodoIssue) => boolean,
): SequenceStrip {
  return { doing: [], next: [] };
}

export function resolveSequenceDrop(_drop: {
  readonly activeId: string;
  readonly overId: string;
  readonly sequence: ReadonlyArray<string>;
  readonly strip: SequenceStrip;
  readonly issuesById: ReadonlyMap<string, TodoIssue>;
}): SequenceDropOutcome {
  return { kind: "board" };
}

export function removeFromSequence(
  sequence: ReadonlyArray<string>,
  _id: string,
): ReadonlyArray<string> {
  return sequence;
}

export function displayedSequence(
  snapshotSequence: ReadonlyArray<string>,
  _pending: PendingSequence | null,
): ReadonlyArray<string> {
  return snapshotSequence;
}
