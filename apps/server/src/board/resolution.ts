export interface BoardProbeResult {
  pointer: string | null;
  inPlace: string | null;
}

export type BoardResolution =
  | { kind: "pointer"; path: string }
  | { kind: "inplace"; path: string }
  | { kind: "none"; path: null };

export const walkUpResolution = (
  startDir: string,
  probe: (dir: string) => BoardProbeResult,
): BoardResolution => {
  const separator = startDir.includes("/") ? "/" : "\\";
  let dir = startDir.replace(/\/+$/, "").replace(/\\+$/, "");
  while (dir !== "") {
    const result = probe(dir);
    if (result.pointer !== null) return { kind: "pointer", path: result.pointer };
    if (result.inPlace !== null) return { kind: "inplace", path: result.inPlace };
    const index = dir.lastIndexOf(separator);
    if (index < 0) break;
    const parent = dir.slice(0, index);
    if (parent === dir) break;
    dir = parent;
  }
  return { kind: "none", path: null };
};
