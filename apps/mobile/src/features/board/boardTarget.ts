import type { EnvironmentId } from "@t3tools/contracts";

export interface BoardTarget {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly title: string;
}

export interface BoardTargetProject {
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string | null | undefined;
  readonly title: string;
}

export function boardTargetFromProject(
  project: BoardTargetProject | null | undefined,
): BoardTarget | null {
  if (project === null || project === undefined) return null;
  if (project.workspaceRoot === null || project.workspaceRoot === undefined) return null;
  if (project.workspaceRoot.trim().length === 0) return null;
  return {
    environmentId: project.environmentId,
    cwd: project.workspaceRoot,
    title: project.title,
  };
}
