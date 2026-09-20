import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, TodoBoardSnapshot, TodoIssue } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { ArrowDownUpIcon, ArrowLeftIcon, Maximize2Icon, TagIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { useEnvironmentQuery } from "../../state/query";
import { todoBoardMutate, todoBoardRead, todoBoardSubscribe } from "../../state/todoBoard";
import { useAtomCommand } from "../../state/use-atom-command";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import {
  Sheet,
  SheetClose,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "../ui/sheet";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  BOARD_SORT_OPTIONS,
  BOARD_STATUS_ORDER,
  boardStatusColourClass,
  boardStatusLabel,
  buildBoardViewModel,
  cardHueStyle,
  type BoardCardViewModel,
  type BoardSortOrder,
} from "./boardView.logic";
import { useBoardUiState } from "./boardUiState";

export interface BoardViewProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly onOpenFullPage?: (() => void) | undefined;
  readonly className?: string;
}

const BOARD_SORT_LABELS = new Map(
  BOARD_SORT_OPTIONS.map((option) => [option.value, option.label] as const),
);

const BOARD_TAG_ALL = "\u0000all";

function BoardCard({
  card,
  onOpen,
}: {
  readonly card: BoardCardViewModel;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={cardHueStyle(card.issue)}
      className={cn(
        "relative block w-full cursor-pointer rounded-lg border p-2 text-left shadow-xs transition-colors hover:border-foreground/30",
        card.tinted ? (card.isRoot ? "board-card-root" : "board-card-child") : "bg-card/70",
        card.issue.status === "blocked" && "board-card-blocked",
      )}
    >
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 text-xs font-medium break-words text-foreground/90">
          {card.issue.title}
        </span>
        {card.badge !== null ? (
          <span
            title={card.badge === "human" ? "Open question for a human" : "Open question"}
            className={cn(
              "shrink-0 rounded-full px-1 text-[.6rem] leading-4 font-bold",
              card.badge === "human" ? "bg-error text-white" : "bg-warning text-warning-foreground",
            )}
          >
            ?
          </span>
        ) : null}
        <span
          aria-label={card.statusLabel}
          title={card.statusLabel}
          className={cn("shrink-0 text-xs leading-4", card.colourClass)}
        >
          {card.glyph}
        </span>
      </div>
      {card.parent !== null ? (
        <div className="mt-1 flex min-w-0">
          <span className="max-w-full truncate rounded-sm bg-muted px-1 text-[.55rem] text-muted-foreground">
            {card.parent.title}
          </span>
        </div>
      ) : null}
      {card.blockedBy.length > 0 ? (
        <div className="mt-1 flex min-w-0 flex-col gap-0.5">
          {card.blockedBy.map((blocker) => (
            <span
              key={blocker.id}
              className="min-w-0 truncate text-[.55rem] text-error/90"
              title={`Blocked by ${blocker.id}`}
            >
              blocked by {blocker.id} {blocker.title}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="shrink-0 font-mono text-[.55rem] text-muted-foreground/60">
          {card.issue.id}
        </span>
        {card.issue.tags.length > 0 ? (
          <span className="min-w-0 truncate font-mono text-[.55rem] text-muted-foreground/50">
            {card.issue.tags.join(", ")}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function BoardMenuControl({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly value: string;
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button size="compact" variant="ghost-muted" aria-label={label}>
            {icon}
            <span className="max-w-32 truncate">{label}</span>
          </Button>
        }
      />
      <MenuPopup align="start" className="min-w-40">
        <MenuRadioGroup value={value} onValueChange={(next) => onChange(next as string)}>
          {options.map((option) => (
            <MenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

function BoardIssueDrawer({
  issue,
  statusOptions,
  onStatusChange,
  onClose,
}: {
  readonly issue: TodoIssue;
  readonly statusOptions: ReadonlyArray<string>;
  readonly onStatusChange: (issue: TodoIssue, status: string) => void;
  readonly onClose: () => void;
}) {
  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetPopup side="right" className="max-w-md">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetClose
              render={
                <Button size="compact" variant="ghost-muted" aria-label="Back to the board">
                  <ArrowLeftIcon />
                  Board
                </Button>
              }
            />
          </div>
          <SheetTitle className="text-base">{issue.title}</SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {issue.id} - {boardStatusLabel(issue.status)}
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Menu>
              <MenuTrigger
                render={
                  <Button size="compact" variant="outline" aria-label="Change status">
                    {boardStatusLabel(issue.status)}
                  </Button>
                }
              />
              <MenuPopup align="start" className="min-w-40">
                <MenuRadioGroup
                  value={issue.status}
                  onValueChange={(next) => onStatusChange(issue, next as string)}
                >
                  {statusOptions.map((status) => (
                    <MenuRadioItem key={status} value={status}>
                      <span className={cn("mr-1", boardStatusColourClass(status))}>{status}</span>
                      {boardStatusLabel(status)}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuPopup>
            </Menu>
            {issue.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[.6rem] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
          {issue.body.trim().length > 0 ? (
            <div className="text-xs whitespace-pre-wrap text-foreground/80">{issue.body}</div>
          ) : null}
          <div className="flex flex-col gap-1 text-[.65rem] text-muted-foreground">
            <span>created {issue.created}</span>
            <span>updated {issue.updated}</span>
            <span className="truncate font-mono">{issue.markerPath}</span>
          </div>
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}

export function BoardView({ environmentId, cwd, onOpenFullPage, className }: BoardViewProps) {
  const probe = useAtomValue(todoBoardRead({ environmentId, input: { cwd } }));
  const snapshotQuery = useEnvironmentQuery(todoBoardSubscribe({ environmentId, input: { cwd } }));
  const resolvedRoot = snapshotQuery.data?.root ?? null;
  const [uiState, updateUiState] = useBoardUiState(resolvedRoot);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const mutate = useAtomCommand(todoBoardMutate, { reportFailure: false });

  const model = useMemo(
    () => (snapshotQuery.data === null ? null : buildBoardViewModel(snapshotQuery.data, uiState)),
    [snapshotQuery.data, uiState],
  );
  const issuesById = useMemo(
    () => new Map((snapshotQuery.data?.issues ?? []).map((issue) => [issue.id, issue] as const)),
    [snapshotQuery.data],
  );
  const selectedIssue = selectedIssueId === null ? null : (issuesById.get(selectedIssueId) ?? null);
  const statusOptions = useMemo(() => {
    const statuses: Array<string> = [...BOARD_STATUS_ORDER];
    if (selectedIssue !== null && !statuses.includes(selectedIssue.status)) {
      statuses.push(selectedIssue.status);
    }
    return statuses;
  }, [selectedIssue]);

  const changeStatus = async (issue: TodoIssue, status: string) => {
    if (issue.status === status) return;
    const result = await mutate({
      environmentId,
      input: { action: "status", cwd, id: issue.id, status },
    });
    if (result._tag !== "Failure") return;
    const failure = squashAtomCommandFailure(result);
    toastManager.add({
      type: "error",
      title: `Could not move ${issue.id} to ${status}`,
      description:
        failure instanceof Error && failure.message.length > 0
          ? failure.message
          : "The board rejected the change.",
    });
  };

  const showMissing =
    snapshotQuery.error !== null || (probe._tag === "Failure" && snapshotQuery.data === null);

  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{model?.repoName ?? "Board"}</div>
          {resolvedRoot !== null ? (
            <div className="truncate font-mono text-[.6rem] text-muted-foreground/60">
              {resolvedRoot}
            </div>
          ) : null}
        </div>
        {model !== null ? (
          <>
            <BoardMenuControl
              label={uiState.tag ?? "All tags"}
              icon={<TagIcon className="size-3.5" />}
              value={uiState.tag ?? BOARD_TAG_ALL}
              options={[
                { value: BOARD_TAG_ALL, label: "All tags" },
                ...model.tags.map((tag) => ({ value: tag, label: tag })),
              ]}
              onChange={(next) => updateUiState({ tag: next === BOARD_TAG_ALL ? null : next })}
            />
            <BoardMenuControl
              label={BOARD_SORT_LABELS.get(uiState.sort) ?? "Sort"}
              icon={<ArrowDownUpIcon className="size-3.5" />}
              value={uiState.sort}
              options={BOARD_SORT_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onChange={(next) => updateUiState({ sort: next as BoardSortOrder })}
            />
          </>
        ) : null}
        {onOpenFullPage ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost-muted"
                  aria-label="Open the board as a full page"
                  onClick={onOpenFullPage}
                >
                  <Maximize2Icon className="size-4" />
                </Button>
              }
            />
            <TooltipPopup side="top">Open full page</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
      {showMissing ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <p className="text-xs text-muted-foreground">No .todo board resolves here.</p>
        </div>
      ) : model === null ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <p className="text-xs text-muted-foreground">Loading board…</p>
        </div>
      ) : model.columns.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <p className="text-xs text-muted-foreground">No active issues.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-2">
          {model.columns.map((column) => (
            <div key={column.status} className="flex w-56 shrink-0 flex-col">
              <div className="px-1 pb-1 text-[.6rem] font-medium tracking-wider uppercase text-muted-foreground/70">
                {column.label}
                <span className="ml-1 font-normal text-muted-foreground/50">
                  {column.cards.length}
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-2">
                {column.cards.map((card) => (
                  <BoardCard
                    key={card.issue.id}
                    card={card}
                    onOpen={() => setSelectedIssueId(card.issue.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {selectedIssue !== null ? (
        <BoardIssueDrawer
          issue={selectedIssue}
          statusOptions={statusOptions}
          onStatusChange={(issue, status) => void changeStatus(issue, status)}
          onClose={() => setSelectedIssueId(null)}
        />
      ) : null}
    </div>
  );
}
