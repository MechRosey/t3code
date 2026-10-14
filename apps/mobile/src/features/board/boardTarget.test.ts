import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { boardTargetFromProject } from "./boardTarget";

const environmentId = "env-1" as EnvironmentId;

describe("board target from project scope", () => {
  it("resolves the workspace root as the board cwd", () => {
    expect(
      boardTargetFromProject({
        environmentId,
        workspaceRoot: "/work/t3code",
        title: "t3code",
      }),
    ).toEqual({ environmentId, cwd: "/work/t3code", title: "t3code" });
  });

  it("rejects projects without a workspace root", () => {
    expect(
      boardTargetFromProject({ environmentId, workspaceRoot: "", title: "t3code" }),
    ).toBeNull();
    expect(
      boardTargetFromProject({ environmentId, workspaceRoot: null, title: "t3code" }),
    ).toBeNull();
    expect(
      boardTargetFromProject({ environmentId, workspaceRoot: undefined, title: "t3code" }),
    ).toBeNull();
  });

  it("rejects a missing project", () => {
    expect(boardTargetFromProject(null)).toBeNull();
    expect(boardTargetFromProject(undefined)).toBeNull();
  });
});
