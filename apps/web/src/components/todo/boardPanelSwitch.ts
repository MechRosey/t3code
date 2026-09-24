import type { EnvironmentId, ProjectId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";

import { buildThreadRouteParams } from "../../threadRoutes";

export interface BoardPanelSwitchSearch {
  readonly environmentId?: EnvironmentId | undefined;
  readonly cwd?: string | undefined;
  readonly threadId?: ThreadId | undefined;
}

export interface BoardPanelSwitchThread {
  readonly id: ThreadId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly worktreePath: string | null;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
}

export interface BoardPanelSwitchProject {
  readonly id: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string;
}

export type BoardOpenStyle = "panel" | "page";

export const BOARD_OPEN_STYLE_STORAGE_KEY = "t3code:board-open-style";

type BoardOpenStyleStorage = Pick<Storage, "getItem" | "setItem">;

function resolveOpenStyleStorage(storage: BoardOpenStyleStorage | undefined) {
  return storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
}

export function resolveBoardOpenStyle(
  stored: string | null,
  hasResolvableThread: boolean,
): BoardOpenStyle {
  if (stored === "page") return "page";
  return hasResolvableThread ? "panel" : "page";
}

export function readStoredBoardOpenStyle(
  storage?: BoardOpenStyleStorage | undefined,
): BoardOpenStyle | null {
  try {
    const raw = resolveOpenStyleStorage(storage)?.getItem(BOARD_OPEN_STYLE_STORAGE_KEY) ?? null;
    return raw === "panel" || raw === "page" ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredBoardOpenStyle(
  style: BoardOpenStyle,
  storage?: BoardOpenStyleStorage | undefined,
): void {
  try {
    resolveOpenStyleStorage(storage)?.setItem(BOARD_OPEN_STYLE_STORAGE_KEY, style);
  } catch {
    return;
  }
}

export interface BoardPanelSwitchTarget {
  readonly threadRef: ScopedThreadRef;
  readonly routeTarget: {
    readonly to: "/$environmentId/$threadId";
    readonly params: ReturnType<typeof buildThreadRouteParams>;
  };
}

function projectKey(environmentId: EnvironmentId, projectId: ProjectId): string {
  return `${environmentId}:${projectId}`;
}

function threadRoot(
  thread: BoardPanelSwitchThread,
  projectsById: Map<string, BoardPanelSwitchProject>,
): string | null {
  if (thread.worktreePath !== null) return thread.worktreePath;
  return (
    projectsById.get(projectKey(thread.environmentId, thread.projectId))?.workspaceRoot ?? null
  );
}

function resolveOriginThread(
  search: BoardPanelSwitchSearch,
  threads: readonly BoardPanelSwitchThread[],
  projectsById: Map<string, BoardPanelSwitchProject>,
): BoardPanelSwitchThread | null {
  if (search.threadId === undefined) return null;
  const thread =
    threads.find(
      (candidate) =>
        candidate.id === search.threadId &&
        (search.environmentId === undefined || candidate.environmentId === search.environmentId),
    ) ?? null;
  if (thread === null || thread.archivedAt !== null) return null;
  const root = threadRoot(thread, projectsById);
  if (root === null) return null;
  if (search.cwd !== undefined && root !== search.cwd) return null;
  return thread;
}

function resolveExactCwdThread(
  search: BoardPanelSwitchSearch,
  threads: readonly BoardPanelSwitchThread[],
  projectsById: Map<string, BoardPanelSwitchProject>,
): BoardPanelSwitchThread | null {
  if (search.cwd === undefined) return null;
  let latest: BoardPanelSwitchThread | null = null;
  for (const thread of threads) {
    if (thread.archivedAt !== null) continue;
    if (search.environmentId !== undefined && thread.environmentId !== search.environmentId) {
      continue;
    }
    if (threadRoot(thread, projectsById) !== search.cwd) continue;
    if (
      latest === null ||
      thread.updatedAt > latest.updatedAt ||
      (thread.updatedAt === latest.updatedAt && thread.id > latest.id)
    ) {
      latest = thread;
    }
  }
  return latest;
}

export function resolveBoardPanelSwitch(
  search: BoardPanelSwitchSearch,
  projects: readonly BoardPanelSwitchProject[],
  threads: readonly BoardPanelSwitchThread[],
): BoardPanelSwitchTarget | null {
  const projectsById = new Map(
    projects.map((project) => [projectKey(project.environmentId, project.id), project]),
  );
  const thread =
    resolveOriginThread(search, threads, projectsById) ??
    resolveExactCwdThread(search, threads, projectsById);
  if (thread === null) return null;
  const threadRef = scopeThreadRef(thread.environmentId, thread.id);
  return {
    threadRef,
    routeTarget: {
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
    },
  };
}

export function resolveProjectBoardEntry(
  project: BoardPanelSwitchProject,
  threads: readonly BoardPanelSwitchThread[],
): BoardPanelSwitchTarget | null {
  if (project.workspaceRoot.length === 0) return null;
  let latest: BoardPanelSwitchThread | null = null;
  for (const thread of threads) {
    if (thread.archivedAt !== null) continue;
    if (thread.environmentId !== project.environmentId || thread.projectId !== project.id) continue;
    if (
      latest === null ||
      thread.updatedAt > latest.updatedAt ||
      (thread.updatedAt === latest.updatedAt && thread.id > latest.id)
    ) {
      latest = thread;
    }
  }
  if (latest === null) return null;
  const threadRef = scopeThreadRef(latest.environmentId, latest.id);
  return {
    threadRef,
    routeTarget: {
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
    },
  };
}
