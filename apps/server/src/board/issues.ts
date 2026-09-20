export interface MarkerStat {
  readonly mtimeMs: number;
  readonly size: number;
}

export const ensureUnchanged = (baseline: MarkerStat, current: MarkerStat): void => {
  if (baseline.mtimeMs !== current.mtimeMs || baseline.size !== current.size) {
    throw new Error(
      `Marker file changed during the write critical section (mtime ${baseline.mtimeMs} -> ${current.mtimeMs}, size ${baseline.size} -> ${current.size}).`,
    );
  }
};

export type IssueDirLookup =
  | { tag: "found"; name: string }
  | { tag: "notFound" }
  | { tag: "ambiguous"; matches: Array<string> };

export const isIssueMarkerFile = (dirName: string, baseName: string): boolean => {
  if (dirName.length < 5) return false;
  return baseName.startsWith(dirName.slice(0, 5));
};

export const findIssueDirName = (dirNames: readonly string[], issueId: string): IssueDirLookup => {
  for (const dirName of dirNames) {
    if (dirName === issueId) return { tag: "found", name: dirName };
  }
  const lowerId = issueId.toLowerCase();
  const prefixMatches = dirNames.filter((dirName) => dirName.toLowerCase().startsWith(lowerId));
  const firstMatch = prefixMatches[0];
  if (prefixMatches.length === 1 && firstMatch !== undefined) {
    return { tag: "found", name: firstMatch };
  }
  if (prefixMatches.length > 1) return { tag: "ambiguous", matches: [...prefixMatches] };
  return { tag: "notFound" };
};

export const resolveLinkId = (ref: string, knownIds: readonly string[]): string => {
  if (ref === "") return ref;
  if (knownIds.includes(ref)) return ref;
  const lowerRef = ref.toLowerCase();
  const prefixMatches = knownIds.filter((id) => id.toLowerCase().startsWith(lowerRef));
  const firstMatch = prefixMatches[0];
  if (prefixMatches.length === 1 && firstMatch !== undefined) return firstMatch;
  return ref;
};

const normalizeBackslashes = (value: string): string => value.replace(/\//g, "\\");

export const isArchivedPath = (boardRoot: string, candidatePath: string): boolean => {
  const archiveRoot = normalizeBackslashes(`${boardRoot.replace(/[\\/]+$/, "")}/archive`);
  const candidate = normalizeBackslashes(candidatePath);
  if (candidate.replace(/\\+$/, "") === archiveRoot) return true;
  return candidate.startsWith(`${archiveRoot}\\`);
};

const BRANCH_CHECKOUT_FOLDER_NAMES = new Set(["dev", "main", "master"]);

export const repoDisplayName = (rootPath: string): string => {
  const segments = rootPath.split(/[\\/]/).filter((segment) => segment !== "");
  const containerSegments = segments.slice(0, -1);
  let name = containerSegments[containerSegments.length - 1] ?? "";
  if (BRANCH_CHECKOUT_FOLDER_NAMES.has(name)) {
    const grandparent = containerSegments[containerSegments.length - 2];
    if (grandparent !== undefined) name = grandparent;
  }
  return name;
};
