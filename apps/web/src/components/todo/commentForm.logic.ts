export const DEFAULT_COMMENT_ACTOR = "peter (T3 UI)";

export function prepareCommentText(raw: string): string | null {
  const flattened = raw.replace(/\s+/g, " ").trim();
  return flattened.length === 0 ? null : flattened;
}

export function prepareCommentActor(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
