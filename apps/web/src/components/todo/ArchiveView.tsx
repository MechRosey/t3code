import type { EnvironmentId, TodoArchiveGroup, TodoIssue } from "@t3tools/contracts";
import {
  boardStatusColourClass,
  boardStatusLabel,
  cardHueStyle,
} from "@t3tools/client-runtime/state/todo-board-view";
import { ArchiveIcon } from "lucide-react";
import { useState } from "react";

import { useEnvironmentQuery } from "../../state/query";
import { todoBoardArchiveRead } from "../../state/todoBoard";
import { cn } from "~/lib/utils";
import { ScrollArea } from "../ui/scroll-area";
import { BoardMarkdown } from "./BoardMarkdown";
import { shortBoardId } from "./boardCopy.logic";
import { BoardPaneHeader, BoardSplitLayout } from "./BoardSplitLayout";
import type { BoardSplitMode } from "./boardSplit.logic";
import type { BoardDrawerMode } from "./boardUiState";

function ArchiveIssuePane({
  issue,
  splitMode,
  drawerMode,
  onDrawerModeChange,
  onClose,
}: {
  readonly issue: TodoIssue;
  readonly splitMode: BoardSplitMode;
  readonly drawerMode: BoardDrawerMode;
  readonly onDrawerModeChange: (mode: BoardDrawerMode) => void;
  readonly onClose: () => void;
}) {
  return (
    <>
      <BoardPaneHeader
        splitMode={splitMode}
        drawerMode={drawerMode}
        onDrawerModeChange={onDrawerModeChange}
        backLabel="Archive"
        backAriaLabel="Back to the archive"
        onClose={onClose}
        title={issue.title}
        description={`${shortBoardId(issue.id)} - ${boardStatusLabel(issue.status)}`}
      />
      <ScrollArea scrollFade className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          {issue.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {issue.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-sm bg-muted px-1 font-mono text-3xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {issue.body.trim().length > 0 ? <BoardMarkdown body={issue.body} /> : null}
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>created {issue.created}</span>
            <span>updated {issue.updated}</span>
            <span className="truncate font-mono">{issue.markerPath}</span>
          </div>
        </div>
      </ScrollArea>
    </>
  );
}

function ArchiveIssueRow({
  issue,
  onOpen,
}: {
  readonly issue: TodoIssue;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border border-transparent p-1.5 text-left transition-colors hover:border-foreground/20 hover:bg-muted/40",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{issue.title}</span>
      <span
        title={issue.title}
        className="shrink-0 font-mono text-xs leading-4 font-bold text-foreground/70"
      >
        {shortBoardId(issue.id)}
      </span>
      <span
        title={boardStatusLabel(issue.status)}
        className={cn("shrink-0 text-xs leading-4", boardStatusColourClass(issue.status))}
      >
        {boardStatusLabel(issue.status)}
      </span>
    </button>
  );
}

function ArchiveGroupCard({
  group,
  onOpen,
}: {
  readonly group: TodoArchiveGroup;
  readonly onOpen: (issue: TodoIssue) => void;
}) {
  const root = group.rootIssue;
  const children =
    root === null ? group.snapshot.issues : group.snapshot.issues.filter((issue) => issue !== root);
  return (
    <section
      style={root === null ? undefined : cardHueStyle(root)}
      className="board-card-root rounded-lg border p-2"
    >
      {root !== null ? (
        <button type="button" onClick={() => onOpen(root)} className="block w-full text-left">
          <span className="block text-xs font-medium break-words text-foreground/90">
            {root.title}
          </span>
          <div className="mt-1 flex items-center gap-2">
            <span
              title={root.title}
              className="font-mono text-xs leading-4 font-bold text-foreground/70"
            >
              {shortBoardId(root.id)}
            </span>
            <span
              className={cn("text-xs leading-4", boardStatusColourClass(root.status))}
              title={boardStatusLabel(root.status)}
            >
              {boardStatusLabel(root.status)}
            </span>
            <span className="ml-auto font-mono text-[.6rem] text-muted-foreground/60">
              {group.dirName}
            </span>
          </div>
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">No root ticket recorded</span>
          <span className="ml-auto font-mono text-[.6rem] text-muted-foreground/60">
            {group.dirName}
          </span>
        </div>
      )}
      {children.length > 0 ? (
        <div className="mt-1.5 flex flex-col">
          {children.map((issue) => (
            <ArchiveIssueRow key={issue.id} issue={issue} onOpen={() => onOpen(issue)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export interface ArchiveViewProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly drawerMode: BoardDrawerMode;
  readonly onDrawerModeChange: (mode: BoardDrawerMode) => void;
}

export function ArchiveView({
  environmentId,
  cwd,
  drawerMode,
  onDrawerModeChange,
}: ArchiveViewProps) {
  const archiveQuery = useEnvironmentQuery(todoBoardArchiveRead({ environmentId, input: { cwd } }));
  const [selected, setSelected] = useState<TodoIssue | null>(null);
  const groups = archiveQuery.data?.groups ?? [];
  if (archiveQuery.error !== null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <p className="max-w-md text-center text-xs text-muted-foreground">{archiveQuery.error}</p>
      </div>
    );
  }
  if (archiveQuery.data === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <p className="text-xs text-muted-foreground">Loading archive…</p>
      </div>
    );
  }
  const closeSelected = () => setSelected(null);
  return (
    <BoardSplitLayout
      drawerMode={drawerMode}
      onClose={closeSelected}
      detail={
        selected === null
          ? null
          : {
              key: selected.markerPath,
              render: (splitMode) => (
                <ArchiveIssuePane
                  issue={selected}
                  splitMode={splitMode}
                  drawerMode={drawerMode}
                  onDrawerModeChange={onDrawerModeChange}
                  onClose={closeSelected}
                />
              ),
            }
      }
      primary={
        groups.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4">
            <ArchiveIcon className="size-5 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">Nothing archived yet.</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {groups.map((group) => (
              <ArchiveGroupCard key={group.dirName} group={group} onOpen={setSelected} />
            ))}
          </div>
        )
      }
    />
  );
}
