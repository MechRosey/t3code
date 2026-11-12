export const EPIC_MARKER_TAG = "epic";

export interface EpicRootCandidate {
  readonly tags: ReadonlyArray<string>;
  readonly epic: string | null;
}

export function epicRootIssues<Issue extends EpicRootCandidate>(
  issues: ReadonlyArray<Issue>,
): Map<string, Issue> {
  const byEpic = new Map<string, Issue>();
  for (const issue of issues) {
    if (!issue.tags.some((tag) => tag.toLowerCase() === EPIC_MARKER_TAG)) continue;
    if (issue.epic === null || issue.epic.length === 0) continue;
    if (byEpic.has(issue.epic)) continue;
    byEpic.set(issue.epic, issue);
  }
  return byEpic;
}
