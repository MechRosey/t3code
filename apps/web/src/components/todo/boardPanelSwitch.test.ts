import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { assert, describe, it } from "vite-plus/test";

import {
  BOARD_OPEN_STYLE_STORAGE_KEY,
  readStoredBoardOpenStyle,
  resolveBoardOpenStyle,
  resolveBoardPanelSwitch,
  resolveProjectBoardEntry,
  writeStoredBoardOpenStyle,
} from "./boardPanelSwitch";

const ENV = "env-1" as EnvironmentId;

function project(
  overrides: {
    id?: string;
    environmentId?: EnvironmentId;
    workspaceRoot?: string;
  } = {},
) {
  return {
    id: (overrides.id ?? "proj-1") as ProjectId,
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
    id: (overrides.id ?? "thread-1") as ThreadId,
    projectId: (overrides.projectId ?? "proj-1") as ProjectId,
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

describe("resolveProjectBoardEntry", () => {
  it("resolves the latest non-archived thread of the project as the side-panel target", () => {
    const target = resolveProjectBoardEntry(project(), [
      thread({ id: "thread-1", updatedAt: "2026-09-01T00:00:00.000Z" }),
      thread({ id: "thread-2", updatedAt: "2026-09-05T00:00:00.000Z" }),
    ]);
    assert.deepEqual(target, {
      threadRef: { environmentId: ENV, threadId: "thread-2" },
      routeTarget: {
        to: "/$environmentId/$threadId",
        params: { environmentId: ENV, threadId: "thread-2" },
      },
    });
  });

  it("never resolves a thread of another project so the panel can only show the clicked project's board", () => {
    const target = resolveProjectBoardEntry(project(), [
      thread({ id: "thread-9", projectId: "proj-2", updatedAt: "2026-09-09T00:00:00.000Z" }),
    ]);
    assert.equal(target, null);
  });

  it("never resolves a thread of another environment so a same-id project elsewhere cannot leak in", () => {
    const target = resolveProjectBoardEntry(project(), [
      thread({ id: "thread-9", environmentId: "env-2" as EnvironmentId }),
    ]);
    assert.equal(target, null);
  });

  it("resolves null when the project has no live thread so the caller falls back to the full page", () => {
    assert.equal(resolveProjectBoardEntry(project(), []), null);
    assert.equal(
      resolveProjectBoardEntry(project(), [thread({ archivedAt: "2026-09-02T00:00:00.000Z" })]),
      null,
    );
  });

  it("resolves a worktree thread of the project even though its thread root is the worktree path", () => {
    const target = resolveProjectBoardEntry(project(), [
      thread({ id: "thread-3", worktreePath: "C:/repo/.worktrees/wt" }),
    ]);
    assert.deepEqual(target?.threadRef, { environmentId: ENV, threadId: "thread-3" });
  });

  it("degrades to null on an empty workspace root so the caller uses the full-page fallback", () => {
    const target = resolveProjectBoardEntry(project({ workspaceRoot: "" }), [thread()]);
    assert.equal(target, null);
  });

  it("breaks update-time ties deterministically by thread id", () => {
    const target = resolveProjectBoardEntry(project(), [
      thread({ id: "thread-1", updatedAt: "2026-09-05T00:00:00.000Z" }),
      thread({ id: "thread-2", updatedAt: "2026-09-05T00:00:00.000Z" }),
    ]);
    assert.deepEqual(target?.threadRef, { environmentId: ENV, threadId: "thread-2" });
  });
});

describe("resolveBoardOpenStyle", () => {
  it("opens the side panel when the stored style is panel and a thread resolves", () => {
    assert.equal(resolveBoardOpenStyle("panel", true), "panel");
  });

  it("falls back to the full page when the stored style is panel but no thread resolves", () => {
    assert.equal(resolveBoardOpenStyle("panel", false), "page");
  });

  it("opens the full page when the stored style is page even though a thread resolves", () => {
    assert.equal(resolveBoardOpenStyle("page", true), "page");
    assert.equal(resolveBoardOpenStyle("page", false), "page");
  });

  it("defaults to the panel-when-a-thread-resolves-else-page behaviour when nothing is stored", () => {
    assert.equal(resolveBoardOpenStyle(null, true), "panel");
    assert.equal(resolveBoardOpenStyle(null, false), "page");
  });

  it("treats an unknown stored value as nothing stored", () => {
    assert.equal(resolveBoardOpenStyle("columns", true), "panel");
    assert.equal(resolveBoardOpenStyle("columns", false), "page");
  });
});

describe("board open style persistence", () => {
  function memoryStorage(entries: Record<string, string> = {}) {
    const map = new Map(Object.entries(entries));
    return {
      getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
      setItem: (key: string, value: string) => void map.set(key, value),
    };
  }

  it("round-trips the open style under the board-open-style key", () => {
    const storage = memoryStorage();
    writeStoredBoardOpenStyle("panel", storage);
    assert.equal(storage.getItem(BOARD_OPEN_STYLE_STORAGE_KEY), "panel");
    assert.equal(readStoredBoardOpenStyle(storage), "panel");
    writeStoredBoardOpenStyle("page", storage);
    assert.equal(readStoredBoardOpenStyle(storage), "page");
  });

  it("reads null when nothing is stored or the stored value is not an open style", () => {
    assert.equal(readStoredBoardOpenStyle(memoryStorage()), null);
    assert.equal(
      readStoredBoardOpenStyle(memoryStorage({ [BOARD_OPEN_STYLE_STORAGE_KEY]: "columns" })),
      null,
    );
    assert.equal(readStoredBoardOpenStyle(undefined), null);
  });

  it("does not throw when writing with no storage available", () => {
    writeStoredBoardOpenStyle("page", undefined);
  });
});
