import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import { resolveBoardPanelSwitch } from "./boardPanelSwitch";

const ENV: EnvironmentId = "env-1";

function project(
  overrides: {
    id?: string;
    environmentId?: EnvironmentId;
    workspaceRoot?: string;
  } = {},
) {
  return {
    id: overrides.id ?? "proj-1",
    environmentId: overrides.environmentId ?? ENV,
    workspaceRoot: overrides.workspaceRoot ?? "C:/repo",
  };
}

function thread(
  overrides: {
    id?: string;
    projectId?: string;
    environmentId?: EnvironmentId;
    worktreePath?: string | null;
    archivedAt?: string | null;
    updatedAt?: string;
  } = {},
) {
  return {
    id: overrides.id ?? "thread-1",
    projectId: overrides.projectId ?? "proj-1",
    environmentId: overrides.environmentId ?? ENV,
    worktreePath: overrides.worktreePath ?? null,
    archivedAt: overrides.archivedAt ?? null,
    updatedAt: overrides.updatedAt ?? "2026-09-01T00:00:00.000Z",
  };
}

describe("resolveBoardPanelSwitch", () => {
  it("resolves the origin threadId carried in the board search params", () => {
    const target = resolveBoardPanelSwitch(
      { environmentId: ENV, cwd: "C:/repo/.worktrees/wt", threadId: "thread-9" as ThreadId },
      [project()],
      [thread({ id: "thread-9", worktreePath: "C:/repo/.worktrees/wt" })],
    );
    assert.deepEqual(target, {
      threadRef: { environmentId: ENV, threadId: "thread-9" },
      routeTarget: {
        to: "/$environmentId/$threadId",
        params: { environmentId: ENV, threadId: "thread-9" },
      },
    });
  });

  it("hides the switch when the origin thread root mismatches the page cwd", () => {
    const target = resolveBoardPanelSwitch(
      { environmentId: ENV, cwd: "C:/repo", threadId: "thread-9" as ThreadId },
      [project()],
      [thread({ id: "thread-9", worktreePath: "C:/repo/.worktrees/wt" })],
    );
    assert.equal(target, null);
  });

  it("hides the switch when the origin threadId is unknown and no thread matches the cwd", () => {
    const target = resolveBoardPanelSwitch(
      { environmentId: ENV, cwd: "C:/nowhere", threadId: "ghost" as ThreadId },
      [project()],
      [thread()],
    );
    assert.equal(target, null);
  });

  it("hides the switch when the origin thread is archived", () => {
    const target = resolveBoardPanelSwitch(
      { environmentId: ENV, cwd: "C:/repo", threadId: "thread-1" as ThreadId },
      [project()],
      [thread({ archivedAt: "2026-09-02T00:00:00.000Z" })],
    );
    assert.equal(target, null);
  });

  it("hides the switch when the origin thread lives in another environment", () => {
    const target = resolveBoardPanelSwitch(
      { environmentId: ENV, cwd: "C:/repo", threadId: "thread-1" as ThreadId },
      [project()],
      [thread({ environmentId: "env-2" as EnvironmentId })],
    );
    assert.equal(target, null);
  });

  it("resolves an exact-cwd thread when the search has no origin threadId", () => {
    const target = resolveBoardPanelSwitch(
      { environmentId: ENV, cwd: "C:/repo" },
      [project()],
      [thread()],
    );
    assert.deepEqual(target, {
      threadRef: { environmentId: ENV, threadId: "thread-1" },
      routeTarget: {
        to: "/$environmentId/$threadId",
        params: { environmentId: ENV, threadId: "thread-1" },
      },
    });
  });

  it("prefers the worktree thread whose root matches the page cwd", () => {
    const target = resolveBoardPanelSwitch(
      { environmentId: ENV, cwd: "C:/wt" },
      [project()],
      [thread({ id: "thread-1" }), thread({ id: "thread-2", worktreePath: "C:/wt" })],
    );
    assert.deepEqual(target?.threadRef, { environmentId: ENV, threadId: "thread-2" });
  });

  it("hides the switch when no thread matches the page cwd instead of falling back to the latest thread", () => {
    const target = resolveBoardPanelSwitch(
      { environmentId: ENV, cwd: "C:/other" },
      [project()],
      [
        thread({ id: "thread-1", updatedAt: "2026-09-09T00:00:00.000Z" }),
        thread({ id: "thread-2", worktreePath: "C:/wt" }),
      ],
    );
    assert.equal(target, null);
  });

  it("picks the most recently updated exact-cwd thread", () => {
    const target = resolveBoardPanelSwitch(
      { environmentId: ENV, cwd: "C:/repo" },
      [project()],
      [
        thread({ id: "thread-1", updatedAt: "2026-09-01T00:00:00.000Z" }),
        thread({ id: "thread-2", updatedAt: "2026-09-05T00:00:00.000Z" }),
      ],
    );
    assert.deepEqual(target?.threadRef, { environmentId: ENV, threadId: "thread-2" });
  });

  it("breaks exact-cwd update-time ties deterministically by id", () => {
    const target = resolveBoardPanelSwitch(
      { environmentId: ENV, cwd: "C:/repo" },
      [project()],
      [
        thread({ id: "thread-1", updatedAt: "2026-09-05T00:00:00.000Z" }),
        thread({ id: "thread-2", updatedAt: "2026-09-05T00:00:00.000Z" }),
      ],
    );
    assert.deepEqual(target?.threadRef, { environmentId: ENV, threadId: "thread-2" });
  });

  it("hides the switch on the page empty state without environment or cwd", () => {
    assert.equal(resolveBoardPanelSwitch({}, [project()], [thread()]), null);
    assert.equal(resolveBoardPanelSwitch({ environmentId: ENV }, [project()], [thread()]), null);
  });

  it("never resolves a draft route target because the panel board only opens under a server thread ref", () => {
    const target = resolveBoardPanelSwitch(
      { environmentId: ENV, cwd: "C:/repo", threadId: "draft-1" as ThreadId },
      [project()],
      [],
    );
    assert.equal(target, null);
  });
});
