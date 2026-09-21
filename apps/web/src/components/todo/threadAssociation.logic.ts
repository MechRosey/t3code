import type { ThreadId } from "@t3tools/contracts";

export type ThreadAssociationMode = "read" | "doing";

export interface ThreadAssociationRecord {
  readonly threadId: ThreadId;
  readonly mode: ThreadAssociationMode;
}

export const BOARD_DISPATCH_ACTOR = "t3 board";

const ASSOCIATION_LINE =
  /^-\s+\*\*[^*]+\*\*(?:\s+\[[^\]]*\])?\s+dispatched thread (\S+) \(-(do|read)\)\s*$/;

export function composeThreadAssociationComment(
  threadId: ThreadId,
  mode: ThreadAssociationMode,
): string {
  const verb = mode === "doing" ? "do" : "read";
  return `dispatched thread ${threadId} (-${verb})`;
}

export function parseThreadAssociationRecords(body: string): Array<ThreadAssociationRecord> {
  const records: Array<ThreadAssociationRecord> = [];
  for (const line of body.split(/\r?\n/)) {
    const match = ASSOCIATION_LINE.exec(line.trim());
    if (match === null) continue;
    const threadId = match[1];
    const verb = match[2];
    if (threadId === undefined || verb === undefined) continue;
    records.push({ threadId: threadId as ThreadId, mode: verb === "do" ? "doing" : "read" });
  }
  return records;
}

export function resolveThreadAssociation(body: string): ThreadAssociationRecord | null {
  let latestDo: ThreadAssociationRecord | null = null;
  let latestRead: ThreadAssociationRecord | null = null;
  for (const record of parseThreadAssociationRecords(body)) {
    if (record.mode === "doing") {
      latestDo = record;
    } else {
      latestRead = record;
    }
  }
  return latestDo ?? latestRead;
}
