import type { EnvironmentId } from "@t3tools/contracts";
import { SquareKanban } from "lucide-react";
import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../components/WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { BoardView } from "../components/todo/BoardView";
import { isElectron } from "../env";
import { useProjects } from "../state/entities";

interface BoardSearch {
  readonly environmentId?: EnvironmentId;
  readonly cwd?: string;
}

export const Route = createFileRoute("/_chat/board")({
  validateSearch: (raw: Record<string, unknown>): BoardSearch => ({
    ...(typeof raw.environmentId === "string" && raw.environmentId
      ? { environmentId: raw.environmentId as EnvironmentId }
      : {}),
    ...(typeof raw.cwd === "string" && raw.cwd ? { cwd: raw.cwd.slice(0, 500) } : {}),
  }),
  component: BoardRouteView,
});

function BoardRouteView() {
  const search = Route.useSearch();
  const projects = useProjects();
  const project = useMemo(
    () =>
      projects.find(
        (candidate) =>
          (search.environmentId === undefined ||
            candidate.environmentId === search.environmentId) &&
          (search.cwd === undefined || candidate.workspaceRoot === search.cwd),
      ) ?? null,
    [projects, search.cwd, search.environmentId],
  );
  return (
    <div className="@container/board flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <WorkspacePageHeader electron={isElectron} className="relative bg-background">
        <WorkspaceBreadcrumb ariaLabel="Board breadcrumb">
          <WorkspaceBreadcrumbItem current>
            <h1 className="truncate">Board</h1>
          </WorkspaceBreadcrumbItem>
          {project ? (
            <>
              <WorkspaceBreadcrumbItem className="shrink gap-1.5">
                <SquareKanban aria-hidden className="size-4 text-muted-foreground" />
                <span className="truncate">{project.title}</span>
              </WorkspaceBreadcrumbItem>
            </>
          ) : null}
        </WorkspaceBreadcrumb>
        <div className="min-w-0 flex-1" />
      </WorkspacePageHeader>
      <div className="min-h-0 flex-1 overflow-hidden">
        {project ? (
          <BoardView environmentId={project.environmentId} cwd={project.workspaceRoot} />
        ) : (
          <div className="flex h-full items-center justify-center p-4">
            <p className="text-sm text-muted-foreground">
              Open the board from a project that has one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
