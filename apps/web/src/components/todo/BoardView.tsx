import { useAtomValue } from "@effect/atom-react";
import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type EnvironmentId,
  type ServerProvider,
  type ThreadId,
  type TodoIssue,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { useSensor, useSensors } from "@dnd-kit/core";
import {
  ArrowDownUpIcon,
  ArrowLeftIcon,
  Maximize2Icon,
  Minimize2Icon,
  NetworkIcon,
  PlusIcon,
  TagIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { useEnvironmentSettings } from "~/hooks/useSettings";
import { newMessageId, newThreadId } from "~/lib/utils";
import { resolveAppModelSelectionState } from "~/modelSelection";
import { NO_PROVIDER_MODEL_SELECTION } from "~/providerInstances";
import { useEnvironmentQuery } from "../../state/query";
import { useProjects } from "../../state/entities";
import { serverEnvironment } from "../../state/server";
import { todoBoardMutate, todoBoardRead, todoBoardSubscribe } from "../../state/todoBoard";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { cn } from "~/lib/utils";
import { SidebarPointerSensor } from "../Sidebar.pointer";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
  Menu,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import {
  Sheet,
  SheetClose,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "../ui/sheet";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Textarea } from "../ui/textarea";
import { BoardOverflowMenu } from "./BoardOverflowMenu";
import {
  DEFAULT_COMMENT_ACTOR,
  prepareCommentActor,
  prepareCommentText,
} from "./commentForm.logic";
import {
  boardDispatchProgress,
  BOARD_NEW_TASK_DISPATCH_KEY,
  BOARD_PIPELINE_STEPS,
  boardStatusRollup,
  composeBoardDispatchPrompt,
  composeBoardNewTaskPrompt,
  composeBoardNewTaskTitle,
  resolveBoardDropAction,
  type BoardDispatchProgress,
  type BoardDropActionMode,
  type BoardDropSpeed,
} from "./boardDrop.logic";
import { normalizeTagInput, unusedBoardTags } from "./tagForm.logic";
import {
  BOARD_SORT_OPTIONS,
  BOARD_STATUS_ORDER,
  boardStatusColourClass,
  boardStatusLabel,
  buildBoardViewModel,
  cardHueStyle,
  type BoardCardViewModel,
  type BoardSortOrder,
} from "@t3tools/client-runtime/state/todo-board-view";
import { useBoardUiState, type BoardViewKind, BOARD_VIEW_OPTIONS } from "./boardUiState";
import { MapView } from "./MapView";
import { buildMapView } from "./mapView.logic";

export interface BoardViewProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly onOpenFullPage?: (() => void) | undefined;
  readonly onOpenInPanel?: (() => void) | undefined;
  readonly className?: string;
}

const BOARD_SORT_LABELS = new Map(
  BOARD_SORT_OPTIONS.map((option) => [option.value, option.label] as const),
);

const BOARD_TAG_ALL = "\u0000all";

const EMPTY_BOARD_PROVIDERS: ReadonlyArray<ServerProvider> = [];

function BoardCard({
  card,
  onOpen,
  progress,
}: {
  readonly card: BoardCardViewModel;
  readonly onOpen: () => void;
  readonly progress: BoardDispatchProgress | null;
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
      {progress !== null ? (
        <div className="mt-1 flex items-center gap-1 text-[.55rem] text-primary">
          <Spinner className="size-3" />
          {progress === "starting" ? "dispatching" : "agent running"}
        </div>
      ) : null}
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

function BoardDraggableCard({
  card,
  onOpen,
  progress,
}: {
  readonly card: BoardCardViewModel;
  readonly onOpen: () => void;
  readonly progress: BoardDispatchProgress | null;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card:${card.issue.id}`,
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn(isDragging && "opacity-40")}>
      <BoardCard card={card} onOpen={onOpen} progress={progress} />
    </div>
  );
}

function BoardColumnCards({
  status,
  children,
}: {
  readonly status: string;
  readonly children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-16 flex-1 flex-col gap-1.5 overflow-y-auto rounded-md pb-2",
        isOver && "bg-muted/40",
      )}
    >
      {children}
    </div>
  );
}

function BoardActionNowTarget({ status }: { readonly status: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `dispatch:${status}` });
  return (
    <span
      ref={setNodeRef}
      aria-label="Drop a card here to action it right away"
      className={cn(
        "ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-sm px-1 py-0.5 text-[.55rem] font-normal normal-case tracking-normal",
        isOver ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      <ZapIcon className="size-2.5" />
      Action now
    </span>
  );
}

function BoardDispatchDialog({
  issue,
  mode,
  hintDismissed,
  onDismissHint,
  onConfirm,
  onFlipStatus,
  onClose,
}: {
  readonly issue: TodoIssue;
  readonly mode: BoardDropActionMode;
  readonly hintDismissed: boolean;
  readonly onDismissHint: () => void;
  readonly onConfirm: (notes: string | null) => void;
  readonly onFlipStatus: () => void;
  readonly onClose: () => void;
}) {
  const [notes, setNotes] = useState("");
  const verb = mode === "doing" ? "do" : "read";
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            Run /todo -{verb} {issue.id}?
          </DialogTitle>
          <DialogDescription>
            Runs the full todo pipeline in its own session on this board's project.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-3">
          {issue.body.trim().length > 0 ? (
            <div className="max-h-40 overflow-y-auto text-xs whitespace-pre-wrap text-foreground/80">
              {issue.body}
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground">
            Pipeline: {BOARD_PIPELINE_STEPS.join(" -> ")}
          </div>
          {!hintDismissed ? (
            <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 p-2 text-[.65rem] text-muted-foreground">
              <span className="min-w-0 flex-1">
                Dropping a card on Read or Doing actions the ticket, not just its column. Use "Just
                flip status" to move it without running anything.
              </span>
              <Button size="compact" variant="ghost-muted" onClick={onDismissHint}>
                Don't show this hint again
              </Button>
            </div>
          ) : null}
          <Textarea
            size="sm"
            placeholder="Extra direction for the agent (optional)"
            aria-label="Dispatch notes"
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />
        </DialogPanel>
        <DialogFooter>
          <Button size="compact" variant="ghost-muted" onClick={onClose}>
            Cancel
          </Button>
          <Button size="compact" variant="outline" onClick={onFlipStatus}>
            Just flip status
          </Button>
          <Button size="compact" onClick={() => onConfirm(notes.trim().length > 0 ? notes : null)}>
            Run now
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function BoardAddTaskDialog({
  pending,
  onConfirm,
  onClose,
}: {
  readonly pending: boolean;
  readonly onConfirm: (idea: string) => void;
  readonly onClose: () => void;
}) {
  const [idea, setIdea] = useState("");
  const prompt = composeBoardNewTaskPrompt(idea);
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add a task</DialogTitle>
          <DialogDescription>
            Dispatches an agent to compose and record the ticket on this board.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-3">
          <Textarea
            size="sm"
            autoFocus
            placeholder="Describe the task in a sentence or two"
            aria-label="New task idea"
            value={idea}
            onChange={(event) => setIdea(event.currentTarget.value)}
          />
        </DialogPanel>
        <DialogFooter>
          <Button size="compact" variant="ghost-muted" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="compact"
            disabled={prompt === null || pending}
            onClick={() => {
              if (prompt === null) return;
              onConfirm(idea);
            }}
          >
            Dispatch
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
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
  boardTags,
  dispatchInFlight,
  onStatusChange,
  onDispatch,
  onComment,
  onTagAdd,
  onTagRemove,
  onClose,
}: {
  readonly issue: TodoIssue;
  readonly statusOptions: ReadonlyArray<string>;
  readonly boardTags: ReadonlyArray<string>;
  readonly dispatchInFlight: boolean;
  readonly onStatusChange: (issue: TodoIssue, status: string) => void;
  readonly onDispatch: (issue: TodoIssue, mode: BoardDropActionMode) => void;
  readonly onComment: (issue: TodoIssue, text: string, by: string | undefined) => Promise<boolean>;
  readonly onTagAdd: (issue: TodoIssue, tag: string) => void;
  readonly onTagRemove: (issue: TodoIssue, tag: string) => void;
  readonly onClose: () => void;
}) {
  const [commentText, setCommentText] = useState("");
  const [commentActor, setCommentActor] = useState(DEFAULT_COMMENT_ACTOR);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [newTagText, setNewTagText] = useState("");
  const preparedComment = prepareCommentText(commentText);
  const preparedTag = normalizeTagInput(newTagText, issue.tags);
  const tagSuggestions = useMemo(
    () => unusedBoardTags(boardTags, issue.tags),
    [boardTags, issue.tags],
  );
  const submitComment = async () => {
    const text = preparedComment;
    if (text === null || submittingComment) return;
    setSubmittingComment(true);
    const succeeded = await onComment(issue, text, prepareCommentActor(commentActor));
    setSubmittingComment(false);
    if (succeeded) setCommentText("");
  };
  const submitNewTag = () => {
    const prepared = preparedTag;
    if (prepared === null) return;
    onTagAdd(issue, prepared.tag);
    setNewTagText("");
  };
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
                      <span className={boardStatusColourClass(status)}>
                        {boardStatusLabel(status)}
                      </span>
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuPopup>
            </Menu>
            <Button
              size="compact"
              variant="outline"
              disabled={dispatchInFlight}
              aria-label={`Dispatch todo -read ${issue.id}`}
              onClick={() => onDispatch(issue, "read")}
            >
              <ZapIcon className="size-3" />
              Read
            </Button>
            <Button
              size="compact"
              variant="outline"
              disabled={dispatchInFlight}
              aria-label={`Dispatch todo -do ${issue.id}`}
              onClick={() => onDispatch(issue, "doing")}
            >
              <ZapIcon className="size-3" />
              Do
            </Button>
            {issue.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-0.5 rounded-sm bg-muted py-0.5 ps-1.5 pe-1 font-mono text-[.6rem] text-muted-foreground"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  className="cursor-pointer rounded-sm text-muted-foreground/50 outline-none hover:text-foreground focus-visible:text-foreground"
                  onClick={() => onTagRemove(issue, tag)}
                >
                  <XIcon className="size-2.5" />
                </button>
              </span>
            ))}
            <Menu>
              <MenuTrigger
                render={
                  <Button size="compact" variant="ghost-muted" aria-label="Add a tag">
                    <PlusIcon className="size-3" />
                    <span>Add tag</span>
                  </Button>
                }
              />
              <MenuPopup align="start" className="min-w-40">
                {tagSuggestions.length > 0 ? (
                  tagSuggestions.map((tag) => (
                    <MenuItem key={tag} onClick={() => onTagAdd(issue, tag)}>
                      {tag}
                    </MenuItem>
                  ))
                ) : (
                  <MenuGroupLabel>No unused board tags</MenuGroupLabel>
                )}
                <MenuSeparator />
                <div
                  className="flex items-center gap-1 p-1"
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") {
                      event.stopPropagation();
                    }
                  }}
                >
                  <Input
                    size="compact"
                    className="flex-1"
                    placeholder="New tag"
                    aria-label="New tag"
                    value={newTagText}
                    onChange={(event) => setNewTagText(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitNewTag();
                      }
                    }}
                  />
                  <Button size="compact" disabled={preparedTag === null} onClick={submitNewTag}>
                    Add
                  </Button>
                </div>
              </MenuPopup>
            </Menu>
          </div>
          {issue.body.trim().length > 0 ? (
            <div className="text-xs whitespace-pre-wrap text-foreground/80">{issue.body}</div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Textarea
              size="sm"
              placeholder="Add a comment to the ticket log"
              aria-label="Comment text"
              value={commentText}
              onChange={(event) => setCommentText(event.currentTarget.value)}
            />
            <div className="flex items-center gap-2">
              <Input
                size="compact"
                className="flex-1"
                placeholder="Commenting as"
                aria-label="Commenting as"
                value={commentActor}
                onChange={(event) => setCommentActor(event.currentTarget.value)}
              />
              <Button
                size="compact"
                variant="outline"
                disabled={preparedComment === null || submittingComment}
                onClick={() => void submitComment()}
              >
                Comment
              </Button>
            </div>
          </div>
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

export function BoardView({
  environmentId,
  cwd,
  onOpenFullPage,
  onOpenInPanel,
  className,
}: BoardViewProps) {
  const probe = useAtomValue(todoBoardRead({ environmentId, input: { cwd } }));
  const snapshotQuery = useEnvironmentQuery(todoBoardSubscribe({ environmentId, input: { cwd } }));
  const resolvedRoot = snapshotQuery.data?.root ?? null;
  const [uiState, updateUiState] = useBoardUiState(resolvedRoot);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [confirmDispatch, setConfirmDispatch] = useState<{
    readonly issue: TodoIssue;
    readonly mode: BoardDropActionMode;
  } | null>(null);
  const [dispatchThreads, setDispatchThreads] = useState<Record<string, ThreadId>>({});
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const mutate = useAtomCommand(todoBoardMutate, { reportFailure: false });
  const startTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const settings = useEnvironmentSettings(environmentId);
  const projects = useProjects();
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_BOARD_PROVIDERS;
  const threadSnapshot = useAtomValue(threadEnvironment.snapshotAtom(environmentId));

  const model = useMemo(
    () => (snapshotQuery.data === null ? null : buildBoardViewModel(snapshotQuery.data, uiState)),
    [snapshotQuery.data, uiState],
  );
  const mapModel = useMemo(
    () => (snapshotQuery.data === null ? null : buildMapView(snapshotQuery.data, uiState)),
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
  const shellsById = useMemo(
    () => new Map((threadSnapshot?.threads ?? []).map((thread) => [thread.id, thread] as const)),
    [threadSnapshot],
  );
  const progressByIssueId = useMemo(() => {
    const out: Record<string, BoardDispatchProgress> = {};
    for (const [issueId, threadId] of Object.entries(dispatchThreads)) {
      const progress = boardDispatchProgress(shellsById.get(threadId));
      if (progress !== "settled") out[issueId] = progress;
    }
    return out;
  }, [dispatchThreads, shellsById]);
  const dispatchInFlight = useMemo(
    () => new Set(Object.keys(progressByIssueId)),
    [progressByIssueId],
  );
  const newTaskProgress = progressByIssueId[BOARD_NEW_TASK_DISPATCH_KEY] ?? null;

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

  const addComment = async (issue: TodoIssue, text: string, by: string | undefined) => {
    const result = await mutate({
      environmentId,
      input: { action: "comment", cwd, id: issue.id, text, by },
    });
    if (result._tag !== "Failure") return true;
    const failure = squashAtomCommandFailure(result);
    toastManager.add({
      type: "error",
      title: `Could not add the comment to ${issue.id}`,
      description:
        failure instanceof Error && failure.message.length > 0
          ? failure.message
          : "The board rejected the comment.",
    });
    return false;
  };

  const mutateTag = async (issue: TodoIssue, tag: string, remove?: boolean) => {
    const result = await mutate({
      environmentId,
      input: { action: "tag", cwd, id: issue.id, tag, remove },
    });
    if (result._tag !== "Failure") return;
    const failure = squashAtomCommandFailure(result);
    toastManager.add({
      type: "error",
      title: `Could not ${remove ? "remove" : "add"} the tag on ${issue.id}`,
      description:
        failure instanceof Error && failure.message.length > 0
          ? failure.message
          : "The board rejected the tag change.",
    });
  };

  const addTag = (issue: TodoIssue, rawTag: string) => {
    const prepared = normalizeTagInput(rawTag, issue.tags);
    if (prepared === null) return;
    void mutateTag(issue, prepared.tag);
  };

  const removeTag = (issue: TodoIssue, tag: string) => {
    void mutateTag(issue, tag, true);
  };

  const applyStatusDrop = async (issue: TodoIssue, status: string) => {
    const result = await mutate({
      environmentId,
      input: { action: "status", cwd, id: issue.id, status },
    });
    if (result._tag !== "Failure") {
      const rollup = boardStatusRollup(issue, status);
      if (rollup === null) return;
      const rollupResult = await mutate({
        environmentId,
        input: { action: "rollup", cwd, id: issue.id, status: rollup.status, text: rollup.text },
      });
      if (rollupResult._tag !== "Failure") return;
      const rollupFailure = squashAtomCommandFailure(rollupResult);
      toastManager.add({
        type: "error",
        title: `Moved ${issue.id} but the rollup failed`,
        description:
          rollupFailure instanceof Error && rollupFailure.message.length > 0
            ? rollupFailure.message
            : "The board rejected the rollup.",
      });
      return;
    }
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

  const runBoardDispatch = async (params: {
    readonly dispatchKey: string;
    readonly subject: string;
    readonly threadTitle: string;
    readonly prompt: string;
  }) => {
    const { dispatchKey, subject, threadTitle, prompt } = params;
    if (dispatchInFlight.has(dispatchKey)) {
      toastManager.add({
        type: "info",
        title: `${subject} is already running`,
        description: "Wait for the current dispatch to settle before running it again.",
      });
      return;
    }
    const project =
      projects.find(
        (candidate) => candidate.environmentId === environmentId && candidate.workspaceRoot === cwd,
      ) ?? null;
    if (project === null) {
      toastManager.add({
        type: "error",
        title: `Could not dispatch ${subject}`,
        description: "No project matches the board's folder.",
      });
      return;
    }
    const resolvedSettings = resolveProjectSettings(settings, project.id, project);
    const modelSelection =
      resolvedSettings.settings.defaultModelSelection ??
      resolveAppModelSelectionState(settings, providers);
    if (modelSelection.model.length === 0 || modelSelection === NO_PROVIDER_MODEL_SELECTION) {
      toastManager.add({
        type: "error",
        title: `Could not dispatch ${subject}`,
        description: "No provider is available to run the session.",
      });
      return;
    }
    const runtimeMode = resolvedSettings.settings.defaultRuntimeMode ?? DEFAULT_RUNTIME_MODE;
    const threadId = newThreadId();
    const createdAt = new Date().toISOString();
    setDispatchThreads((prev) => ({ ...prev, [dispatchKey]: threadId }));
    const result = await startTurn({
      environmentId,
      input: {
        threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: prompt,
          attachments: [],
        },
        runtimeMode,
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        bootstrap: {
          createThread: {
            projectId: project.id,
            title: threadTitle,
            modelSelection,
            runtimeMode,
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
            branch: null,
            worktreePath: null,
            createdAt,
          },
        },
        createdAt,
      },
    });
    if (result._tag !== "Failure") return;
    setDispatchThreads((prev) => {
      const next = { ...prev };
      delete next[dispatchKey];
      return next;
    });
    const failure = squashAtomCommandFailure(result);
    toastManager.add({
      type: "error",
      title: `Could not dispatch ${subject}`,
      description:
        failure instanceof Error && failure.message.length > 0
          ? failure.message
          : "The session did not start.",
    });
  };

  const dispatchBoardAction = async (
    issue: TodoIssue,
    mode: BoardDropActionMode,
    notes: string | null,
  ) => {
    await runBoardDispatch({
      dispatchKey: issue.id,
      subject: issue.id,
      threadTitle: `todo ${issue.id}`,
      prompt: composeBoardDispatchPrompt(issue.id, mode, notes),
    });
  };

  const dispatchNewTask = (ideaText: string) => {
    const prompt = composeBoardNewTaskPrompt(ideaText);
    if (prompt === null) return;
    void runBoardDispatch({
      dispatchKey: BOARD_NEW_TASK_DISPATCH_KEY,
      subject: "the new task",
      threadTitle: composeBoardNewTaskTitle(ideaText),
      prompt,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over === null) return;
    const issue = issuesById.get(String(active.id).slice("card:".length));
    if (issue === undefined) return;
    const overId = String(over.id);
    let target: string | null = null;
    let speed: BoardDropSpeed = "confirm";
    if (overId.startsWith("column:")) {
      target = overId.slice("column:".length);
    } else if (overId.startsWith("dispatch:")) {
      target = overId.slice("dispatch:".length);
      speed = "now";
    }
    if (target === null) return;
    const action = resolveBoardDropAction(issue.status, target, speed);
    if (action.kind === "noop") return;
    if (action.kind === "status") {
      void applyStatusDrop(issue, action.status);
      return;
    }
    if (speed === "now") {
      void dispatchBoardAction(issue, action.mode, null);
      return;
    }
    setConfirmDispatch({ issue, mode: action.mode });
  };

  const attachDragSensor = useCallback(() => {}, []);
  const finishCardDrag = useCallback(() => {}, []);
  const dndSensors = useSensors(
    useSensor(SidebarPointerSensor, {
      distance: 6,
      onAttach: attachDragSensor,
      onFinish: finishCardDrag,
    }),
  );

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
              label={uiState.view === "map" ? "Map" : "Columns"}
              icon={<NetworkIcon className="size-3.5" />}
              value={uiState.view}
              options={BOARD_VIEW_OPTIONS}
              onChange={(next) => updateUiState({ view: next as BoardViewKind })}
            />
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
            {snapshotQuery.data === null ? null : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost-muted"
                      aria-label="Add a task"
                      onClick={() => setAddTaskOpen(true)}
                    >
                      <PlusIcon className="size-4" />
                    </Button>
                  }
                />
                <TooltipPopup side="top">Add task</TooltipPopup>
              </Tooltip>
            )}
            {newTaskProgress !== null ? (
              <span className="flex items-center gap-1 text-[.6rem] text-primary">
                <Spinner className="size-3" />
                {newTaskProgress === "starting" ? "dispatching" : "agent running"}
              </span>
            ) : null}
            {snapshotQuery.data === null ? null : (
              <BoardOverflowMenu
                environmentId={environmentId}
                cwd={cwd}
                issues={snapshotQuery.data.issues}
              />
            )}
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
        {onOpenInPanel ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost-muted"
                  aria-label="Open the board in the side panel"
                  onClick={onOpenInPanel}
                >
                  <Minimize2Icon className="size-4" />
                </Button>
              }
            />
            <TooltipPopup side="top">Open in side panel</TooltipPopup>
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
      ) : uiState.view === "map" ? (
        mapModel === null || mapModel.nodes.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            <p className="text-xs text-muted-foreground">No active issues.</p>
          </div>
        ) : (
          <MapView model={mapModel} onNodeOpen={setSelectedIssueId} />
        )
      ) : model.columns.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <p className="text-xs text-muted-foreground">No active issues.</p>
        </div>
      ) : (
        <DndContext sensors={dndSensors} onDragEnd={handleDragEnd}>
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-2">
            {model.columns.map((column) => (
              <div key={column.status} className="flex w-56 shrink-0 flex-col">
                <div className="flex items-center gap-1 px-1 pb-1 text-[.6rem] font-medium tracking-wider uppercase text-muted-foreground/70">
                  <span className="min-w-0 truncate">
                    {column.label}
                    <span className="ml-1 font-normal text-muted-foreground/50">
                      {column.cards.length}
                    </span>
                  </span>
                  {column.status === "read" || column.status === "doing" ? (
                    <BoardActionNowTarget status={column.status} />
                  ) : null}
                </div>
                <BoardColumnCards status={column.status}>
                  {column.cards.map((card) => (
                    <BoardDraggableCard
                      key={card.issue.id}
                      card={card}
                      progress={progressByIssueId[card.issue.id] ?? null}
                      onOpen={() => setSelectedIssueId(card.issue.id)}
                    />
                  ))}
                </BoardColumnCards>
              </div>
            ))}
          </div>
        </DndContext>
      )}
      {addTaskOpen ? (
        <BoardAddTaskDialog
          pending={newTaskProgress !== null}
          onConfirm={(idea) => {
            setAddTaskOpen(false);
            dispatchNewTask(idea);
          }}
          onClose={() => setAddTaskOpen(false)}
        />
      ) : null}
      {confirmDispatch !== null ? (
        <BoardDispatchDialog
          issue={confirmDispatch.issue}
          mode={confirmDispatch.mode}
          hintDismissed={uiState.dropHintDismissed}
          onDismissHint={() => updateUiState({ dropHintDismissed: true })}
          onConfirm={(notes) => {
            const target = confirmDispatch;
            setConfirmDispatch(null);
            void dispatchBoardAction(target.issue, target.mode, notes);
          }}
          onFlipStatus={() => {
            const target = confirmDispatch;
            setConfirmDispatch(null);
            void changeStatus(target.issue, target.mode);
          }}
          onClose={() => setConfirmDispatch(null)}
        />
      ) : null}
      {selectedIssue !== null ? (
        <BoardIssueDrawer
          issue={selectedIssue}
          statusOptions={statusOptions}
          boardTags={model?.tags ?? []}
          dispatchInFlight={dispatchInFlight.has(selectedIssue.id)}
          onStatusChange={(issue, status) => void changeStatus(issue, status)}
          onDispatch={(issue, mode) => setConfirmDispatch({ issue, mode })}
          onComment={addComment}
          onTagAdd={addTag}
          onTagRemove={removeTag}
          onClose={() => setSelectedIssueId(null)}
        />
      ) : null}
    </div>
  );
}
