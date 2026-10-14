export function normalizeTagInput(
  raw: string,
  existingTags: ReadonlyArray<string>,
): { tag: string } | null {
  const tag = raw.trim();
  if (tag.length === 0) return null;
  const lower = tag.toLowerCase();
  if (existingTags.some((existing) => existing.toLowerCase() === lower)) return null;
  return { tag };
}

export function unusedBoardTags(
  boardTags: ReadonlyArray<string>,
  issueTags: ReadonlyArray<string>,
): Array<string> {
  return boardTags.filter(
    (tag) => !issueTags.some((existing) => existing.toLowerCase() === tag.toLowerCase()),
  );
}
