import type { TodoBoardSnapshot, TodoIssue } from "@t3tools/contracts";

import { isClosedStatus } from "../../../board/sequence.ts";

const ticketOf = (issue: TodoIssue, blockedBy: ReadonlyArray<string>) => ({
  id: issue.id,
  title: issue.title,
  status: issue.status,
  ...(issue.tags.length > 0 ? { tags: issue.tags } : {}),
  ...(issue.parentId === null ? {} : { parentId: issue.parentId }),
  ...(issue.epic === null ? {} : { epic: issue.epic }),
  ...(issue.links.blocks.length > 0 ? { blocks: issue.links.blocks } : {}),
  ...(blockedBy.length > 0 ? { blockedBy } : {}),
});

export const boardOverview = (snapshot: TodoBoardSnapshot) => {
  const open = snapshot.issues.filter((issue) => !issue.archived && !isClosedStatus(issue.status));
  const blockers = new Map<string, Array<string>>();
  for (const issue of open) {
    for (const blocked of issue.links.blocks) {
      blockers.set(blocked, [...(blockers.get(blocked) ?? []), issue.id]);
    }
  }
  const plannedEpics = Object.entries(snapshot.epicSequences ?? {}).filter(
    ([, ids]) => ids.length > 0,
  );
  return {
    root: snapshot.root,
    sequence: snapshot.sequence,
    ...(plannedEpics.length > 0 ? { epicSequences: Object.fromEntries(plannedEpics) } : {}),
    open: open.map((issue) => ticketOf(issue, blockers.get(issue.id) ?? [])),
  };
};
