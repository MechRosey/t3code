import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, TodoIssue } from "@t3tools/contracts";

import { todoBoardRead } from "../../state/todoBoard";

const STATUS_ORDER = ["backlog", "doing", "read", "blocked", "done", "cancelled"] as const;

const STATUS_LABELS: Record<(typeof STATUS_ORDER)[number], string> = {
  backlog: "Backlog",
  doing: "Doing",
  read: "Read",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

function BoardIssueRow({ issue, indent }: { issue: TodoIssue; indent: number }) {
  return (
    <div
      className="flex items-baseline gap-2 rounded-sm px-1.5 py-0.5 hover:bg-accent/40"
      style={{ paddingLeft: `${0.375 + indent * 0.75}rem` }}
    >
      <span className="shrink-0 font-mono text-[.6rem] text-muted-foreground/60">{issue.id}</span>
      <span className="truncate text-xs text-foreground/90">{issue.title}</span>
      {issue.tags.length > 0 ? (
        <span className="ml-auto shrink-0 truncate font-mono text-[.6rem] text-muted-foreground/50">
          {issue.tags.join(", ")}
        </span>
      ) : null}
    </div>
  );
}

export function BoardPanel({ environmentId, cwd }: { environmentId: EnvironmentId; cwd: string }) {
  const result = useAtomValue(todoBoardRead({ environmentId, input: { cwd } }));

  if (result._tag === "Failure") {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs text-muted-foreground">
          No .todo board resolves from this workspace.
        </p>
      </div>
    );
  }
  if (result._tag !== "Success") {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs text-muted-foreground">Loading board…</p>
      </div>
    );
  }

  const { root, repoName, issues } = result.value;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border/50 px-3 py-2">
        <div className="text-xs font-medium">{repoName}</div>
        <div className="truncate font-mono text-[.6rem] text-muted-foreground/60" title={root}>
          {root}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {STATUS_ORDER.map((status) => {
          const column = issues.filter((issue) => issue.status === status);
          if (column.length === 0) return null;
          return (
            <div key={status} className="mb-3">
              <div className="px-1.5 pb-1 text-[.6rem] font-medium uppercase tracking-wider text-muted-foreground/70">
                {STATUS_LABELS[status]}
                <span className="ml-1 font-normal text-muted-foreground/50">{column.length}</span>
              </div>
              {column.map((issue) => (
                <BoardIssueRow key={issue.id} issue={issue} indent={issue.depth} />
              ))}
            </div>
          );
        })}
        {issues.length === 0 ? (
          <p className="px-1.5 py-2 text-xs text-muted-foreground">No active issues.</p>
        ) : null}
      </div>
    </div>
  );
}
