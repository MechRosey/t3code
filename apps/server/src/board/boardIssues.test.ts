import { describe, expect, it } from "vite-plus/test";

import {
  findIssueDirName,
  isArchivedPath,
  isIssueMarkerFile,
  repoDisplayName,
  resolveLinkId,
  type IssueDirLookup,
} from "./issues.ts";
import { walkUpResolution, type BoardProbeResult } from "./resolution.ts";

const found = (name: string): IssueDirLookup => ({ tag: "found", name });

describe("isIssueMarkerFile", () => {
  it("accepts a marker whose basename starts with the directory's first five characters", () => {
    expect(isIssueMarkerFile("abc12-some-issue", "abc12-some-issue")).toBe(true);
    expect(isIssueMarkerFile("abc12-some-issue", "abc12-drifted-name")).toBe(true);
  });

  it("rejects directories shorter than five characters", () => {
    expect(isIssueMarkerFile("abc", "abc")).toBe(false);
    expect(isIssueMarkerFile("ab12", "ab12")).toBe(false);
  });

  it("rejects markers whose basename does not share the id prefix", () => {
    expect(isIssueMarkerFile("abc12-some-issue", "zzz99-notes")).toBe(false);
  });
});

describe("findIssueDirName", () => {
  const dirs = ["abc12-alpha", "abc99-beta", "XYZ78-gamma"];

  it("prefers an exact id", () => {
    expect(findIssueDirName(dirs, "abc12-alpha")).toEqual(found("abc12-alpha"));
  });

  it("expands a unique case-insensitive prefix", () => {
    expect(findIssueDirName(dirs, "ABC12")).toEqual(found("abc12-alpha"));
    expect(findIssueDirName(dirs, "abc9")).toEqual(found("abc99-beta"));
    expect(findIssueDirName(dirs, "xyz78-gamma")).toEqual(found("XYZ78-gamma"));
  });

  it("reports ambiguity instead of picking silently", () => {
    expect(findIssueDirName(dirs, "abc")).toEqual({
      tag: "ambiguous",
      matches: ["abc12-alpha", "abc99-beta"],
    });
  });

  it("reports a missing issue", () => {
    expect(findIssueDirName(dirs, "zzz")).toEqual({ tag: "notFound" });
  });
});

describe("resolveLinkId", () => {
  const ids = ["abc12-alpha", "abc99-beta"];

  it("keeps exact references", () => {
    expect(resolveLinkId("abc12-alpha", ids)).toBe("abc12-alpha");
  });

  it("expands a unique prefix and leaves ambiguous or unknown refs unchanged", () => {
    expect(resolveLinkId("abc9", ids)).toBe("abc99-beta");
    expect(resolveLinkId("abc", ids)).toBe("abc");
    expect(resolveLinkId("zzz", ids)).toBe("zzz");
    expect(resolveLinkId("", ids)).toBe("");
  });
});

describe("isArchivedPath", () => {
  it("matches the archive directory boundary on both separators", () => {
    expect(isArchivedPath("C:\\board", "C:\\board\\archive")).toBe(true);
    expect(isArchivedPath("C:\\board", "C:\\board\\archive\\abc12-issue")).toBe(true);
    expect(isArchivedPath("C:\\board", "C:/board/archive/abc12-issue")).toBe(true);
  });

  it("does not prefix-match siblings of the archive directory", () => {
    expect(isArchivedPath("C:\\board", "C:\\board\\archive-old\\abc12-issue")).toBe(false);
    expect(isArchivedPath("C:\\board", "C:\\board\\archived")).toBe(false);
    expect(isArchivedPath("C:\\board", "C:\\board\\abc12-issue")).toBe(false);
  });
});

describe("repoDisplayName", () => {
  it("uses the container folder's leaf name", () => {
    expect(repoDisplayName("C:\\projects\\RoadsideSuite\\.todo")).toBe("RoadsideSuite");
  });

  it("walks one more level for branch-checkout folder names", () => {
    expect(repoDisplayName("C:\\projects\\RoadsideSuite\\dev\\.todo")).toBe("RoadsideSuite");
    expect(repoDisplayName("C:\\projects\\RoadsideSuite\\main\\.todo")).toBe("RoadsideSuite");
    expect(repoDisplayName("C:\\projects\\RoadsideSuite\\master\\.todo")).toBe("RoadsideSuite");
  });

  it("keeps other branch names as the display name", () => {
    expect(repoDisplayName("C:\\projects\\RoadsideSuite\\t3todo\\.todo")).toBe("t3todo");
  });
});

describe("walkUpResolution", () => {
  const tree = (markers: Record<string, Partial<BoardProbeResult>>) => {
    const probe = (dir: string): BoardProbeResult => ({
      pointer: markers[dir]?.pointer ?? null,
      inPlace: markers[dir]?.inPlace ?? null,
    });
    return { probe };
  };

  it("resolves to the deepest in-place board", () => {
    const { probe } = tree({
      "C:\\repo": { inPlace: "C:\\repo\\.todo" },
      "C:\\repo\\sub\\deep": { inPlace: "C:\\repo\\sub\\deep\\.todo" },
    });
    expect(walkUpResolution("C:\\repo\\sub\\deep", probe)).toEqual({
      kind: "inplace",
      path: "C:\\repo\\sub\\deep\\.todo",
    });
  });

  it("prefers a pointer over a co-located in-place board", () => {
    const { probe } = tree({
      "C:\\repo": { pointer: "C:\\central\\key\\.todo", inPlace: "C:\\repo\\.todo" },
    });
    expect(walkUpResolution("C:\\repo\\sub", probe)).toEqual({
      kind: "pointer",
      path: "C:\\central\\key\\.todo",
    });
  });

  it("walks up past intermediate directories with no markers", () => {
    const { probe } = tree({ "C:\\repo": { inPlace: "C:\\repo\\.todo" } });
    expect(walkUpResolution("C:\\repo\\a\\b\\c", probe)).toEqual({
      kind: "inplace",
      path: "C:\\repo\\.todo",
    });
  });

  it("reports none when no directory holds a board", () => {
    const { probe } = tree({});
    expect(walkUpResolution("C:\\repo\\sub", probe)).toEqual({ kind: "none", path: null });
  });

  it("handles a container board found from the workspace root itself", () => {
    const { probe } = tree({ "C:\\container": { inPlace: "C:\\container\\.todo" } });
    expect(walkUpResolution("C:\\container\\t3todo\\apps\\server\\src", probe)).toEqual({
      kind: "inplace",
      path: "C:\\container\\.todo",
    });
  });
});
