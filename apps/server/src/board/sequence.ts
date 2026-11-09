import { findIssueDirName } from "./issues.ts";

export const SEQUENCE_FILE = "SEQUENCE.md";
export const SEQUENCE_TEMP_FILE = `${SEQUENCE_FILE}.tmp`;

const SHORT_ID_LENGTH = 5;
const CLOSED_STATUSES: ReadonlyArray<string> = ["done", "cancelled"];
const DOING_STATUS = "doing";
const BACKLOG_STATUS = "backlog";

export interface SequenceIssue {
  readonly id: string;
  readonly status: string;
}

const isClosedStatus = (status: string): boolean => CLOSED_STATUSES.includes(status);

export const leavesSequence = (from: string, to: string): boolean =>
  isClosedStatus(to) || (from === DOING_STATUS && to === BACKLOG_STATUS);

export const parseSequenceRefs = (text: string): Array<string> =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

export const resolveSequence = (
  refs: ReadonlyArray<string>,
  issues: ReadonlyArray<SequenceIssue>,
): Array<string> => {
  const ids = issues.map((issue) => issue.id);
  const openIds = new Set(
    issues.filter((issue) => !isClosedStatus(issue.status)).map((issue) => issue.id),
  );
  const resolved: Array<string> = [];
  for (const ref of refs) {
    const lookup = findIssueDirName(ids, ref);
    if (lookup.tag !== "found" || !openIds.has(lookup.name) || resolved.includes(lookup.name)) {
      continue;
    }
    resolved.push(lookup.name);
  }
  return resolved;
};

const toShortId = (id: string, allIds: ReadonlyArray<string>): string => {
  const short = id.slice(0, SHORT_ID_LENGTH);
  const lowerShort = short.toLowerCase();
  const sharing = allIds.filter((other) => other.toLowerCase().startsWith(lowerShort));
  return sharing.length > 1 ? id : short;
};

export const serializeSequence = (
  ids: ReadonlyArray<string>,
  allIds: ReadonlyArray<string>,
): string => ids.map((id) => `${toShortId(id, allIds)}\n`).join("");
