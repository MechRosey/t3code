import { joinSequenceEntry, sequenceEntryIds } from "@t3tools/shared/todoSequence";

import { findIssueDirName } from "./issues.ts";

export const SEQUENCE_FILE = "SEQUENCE.md";
export const SEQUENCE_TEMP_FILE = `${SEQUENCE_FILE}.tmp`;

const SHORT_ID_LENGTH = 5;
const CLOSED_STATUSES: ReadonlyArray<string> = ["done", "cancelled"];
const LINE_TERMINATOR = /\r?\n$/;

export interface SequenceIssue {
  readonly id: string;
  readonly status: string;
}

export const isClosedStatus = (status: string): boolean => CLOSED_STATUSES.includes(status);

export const parseSequenceRefs = (text: string): Array<string> =>
  text
    .split(/\r?\n/)
    .map((line) => joinSequenceEntry(sequenceEntryIds(line)))
    .filter((entry) => entry !== "");

export const resolveSequence = (
  refs: ReadonlyArray<string>,
  issues: ReadonlyArray<SequenceIssue>,
): Array<string> => {
  const ids = issues.map((issue) => issue.id);
  const openIds = new Set(
    issues.filter((issue) => !isClosedStatus(issue.status)).map((issue) => issue.id),
  );
  const seen = new Set<string>();
  const entries: Array<string> = [];
  for (const ref of refs) {
    const group: Array<string> = [];
    for (const token of sequenceEntryIds(ref)) {
      const lookup = findIssueDirName(ids, token);
      if (lookup.tag !== "found" || !openIds.has(lookup.name) || seen.has(lookup.name)) continue;
      seen.add(lookup.name);
      group.push(lookup.name);
    }
    if (group.length > 0) entries.push(joinSequenceEntry(group));
  }
  return entries;
};

const resolveAllTokens = (
  tokens: ReadonlyArray<string>,
  allIds: ReadonlyArray<string>,
): Array<string> | null => {
  const names: Array<string> = [];
  for (const token of tokens) {
    const lookup = findIssueDirName(allIds, token);
    if (lookup.tag !== "found") return null;
    names.push(lookup.name);
  }
  return names;
};

const pruneLine = (line: string, allIds: ReadonlyArray<string>, targetId: string): string => {
  const tokens = sequenceEntryIds(line);
  const names = resolveAllTokens(tokens, allIds);
  if (names === null || !names.includes(targetId)) return line;
  const kept = tokens.filter((_, index) => names[index] !== targetId);
  if (kept.length === 0) return "";
  return `${joinSequenceEntry(kept)}${LINE_TERMINATOR.exec(line)?.[0] ?? ""}`;
};

export const removeSequenceRef = (
  text: string,
  allIds: ReadonlyArray<string>,
  targetId: string,
): string =>
  text
    .split(/(?<=\n)/)
    .map((line) => pruneLine(line, allIds, targetId))
    .join("");

const toShortId = (id: string, allIds: ReadonlyArray<string>): string => {
  const short = id.slice(0, SHORT_ID_LENGTH);
  const lowerShort = short.toLowerCase();
  const sharing = allIds.filter((other) => other.toLowerCase().startsWith(lowerShort));
  return sharing.length > 1 ? id : short;
};

export const serializeSequence = (
  entries: ReadonlyArray<string>,
  allIds: ReadonlyArray<string>,
): string =>
  entries
    .map(
      (entry) =>
        `${joinSequenceEntry(sequenceEntryIds(entry).map((id) => toShortId(id, allIds)))}\n`,
    )
    .join("");
