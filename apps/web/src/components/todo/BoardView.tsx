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
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { classifyTodoBoardFailure } from "@t3tools/client-runtime/state/todo-board-status";
import { DndContext, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { useSensor, useSensors } from "@dnd-kit/core";
import {
  ArrowDownUpIcon,
  Maximize2Icon,
  Minimize2Icon,
  NetworkIcon,
  PlusIcon,
  TagIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";

import { useEnvironmentSettings } from "~/hooks/useSettings";
import { newMessageId, newThreadId } from "~/lib/utils";
import { resolveAppModelSelectionState } from "~/modelSelection";
import { NO_PROVIDER_MODEL_SELECTION } from "~/providerInstances";
import { useRightPanelStore } from "../../rightPanelStore";
import { buildThreadRouteParams } from "../../threadRoutes";
import { useEnvironmentQuery } from "../../state/query";
import { useProjects } from "../../state/entities";
import { serverEnvironment } from "../../state/server";
import { todoBoardMutate, todoBoardSubscribe } from "../../state/todoBoard";
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
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Textarea } from "../ui/textarea";
import { BoardOverflowMenu } from "./BoardOverflowMenu";
import { BoardDraggableCard, BoardDragPreview } from "./BoardCard";
import { shortBoardId } from "./boardCopy.logic";
import { BoardIssuePane } from "./BoardIssuePane";
import { BoardSplitLayout, type BoardSplitDetail } from "./BoardSplitLayout";
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
import {
  BOARD_DISPATCH_FAILURE_CODE,
  BOARD_DISPATCH_STARTED,
  boardDispatchFailureLogFields,
  boardDispatchFailureToast,
  boardStartFailure,
  createBoardDispatchFailure,
  isAddTaskSubmitDisabled,
  listBoardProjectOptions,
  resolveBoardDispatchProject,
  shouldAutoCloseAddTask,
  shouldCloseAddTaskDialog,
  shouldOfferProjectPicker,
  type BoardDispatchFailure,
  type BoardDispatchResult,
  type BoardProjectOption,
} from "./boardDispatch.logic";
import { normalizeTagInput } from "./tagForm.logic";
import {
  BOARD_DISPATCH_ACTOR,
  composeThreadAssociationComment,
  resolveThreadAssociation,
} from "./threadAssociation.logic";
import {
  BOARD_SORT_OPTIONS,
  BOARD_STATUS_ORDER,
  buildBoardViewModel,
  EMPTY_BOARD_SNAPSHOT,
  isBoardFilterActive,
  isQuickFilterActive,
  toggleTagSpecTerm,
  type BoardSortOrder,
} from "@t3tools/client-runtime/state/todo-board-view";
import {
  useBoardUiState,
  type BoardDrawerMode,
  type BoardViewKind,
  BOARD_VIEW_OPTIONS,
} from "./boardUiState";
import { ArchiveView } from "./ArchiveView";
import { buildFocusGraph } from "./mapView.logic";

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

const BOARD_DISPATCH_FAILED_LOG_MESSAGE = "[todo-board] Dispatch failed";

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
        isOver && "outline-[1.5px] outline-dashed outline-primary -outline-offset-4",
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
        isOver
          ? "bg-muted text-primary outline-[1.5px] outline-dashed outline-primary outline-offset-[1px]"
          : "bg-muted text-muted-foreground",
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

interface BoardAddTaskSubmission {
  readonly idea: string;
  readonly projectId: string | null;
  readonly threadId: ThreadId;
}

function BoardProjectPicker({
  options,
  value,
  onChange,
}: {
  readonly options: ReadonlyArray<BoardProjectOption>;
  readonly value: string | null;
  readonly onChange: (projectId: string) => void;
}) {
  const labelById = new Map(options.map((option) => [option.id, option.label] as const));
  return (
    <Select value={value} onValueChange={(next) => next !== null && onChange(next)}>
      <SelectTrigger size="sm" aria-label="Project for the new task">
        <SelectValue>
          {(selected: string | null) =>
            selected === null ? "Choose a project" : (labelById.get(selected) ?? selected)
          }
        </SelectValue>
      </SelectTrigger>
      <SelectPopup alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{option.label}</span>
              <span className="truncate font-mono text-3xs text-muted-foreground">
                {option.path}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

function BoardAddTaskDialog({
  pending,
  projectOptions,
  onConfirm,
  onClose,
}: {
  readonly pending: boolean;
  readonly projectOptions: ReadonlyArray<BoardProjectOption>;
  readonly onConfirm: (submission: BoardAddTaskSubmission) => Promise<BoardDispatchResult>;
  readonly onClose: () => void;
}) {
  const [idea, setIdea] = useState("");
  const [threadId] = useState(newThreadId);
  const [chosenProjectId, setChosenProjectId] = useState<string | null>(null);
  const [failure, setFailure] = useState<BoardDispatchFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const prompt = composeBoardNewTaskPrompt(idea);
  const pickerShown = shouldOfferProjectPicker({
    failure,
    chosenProjectId,
    optionCount: projectOptions.length,
  });
  const submitDisabled = isAddTaskSubmitDisabled({
    hasPrompt: prompt !== null,
    pending,
    submitting,
    pickerShown,
    chosenProjectId,
  });
  const submit = async () => {
    setSubmitting(true);
    const result = await onConfirm({ idea, projectId: chosenProjectId, threadId });
    setSubmitting(false);
    setFailure(result.status === "failed" ? result : null);
  };
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
          {pickerShown ? (
            <BoardProjectPicker
              options={projectOptions}
              value={chosenProjectId}
              onChange={setChosenProjectId}
            />
          ) : null}
          {failure !== null ? (
            <p role="alert" className="text-xs text-destructive">
              {failure.message}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button size="compact" variant="ghost-muted" onClick={onClose}>
            Cancel
          </Button>
          <Button size="compact" disabled={submitDisabled} onClick={() => void submit()}>
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

function BoardFilterChip({
  label,
  hue,
  active,
  onClick,
}: {
  readonly label: string;
  readonly hue: number | null;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={label}
      onClick={onClick}
      style={hue === null ? undefined : ({ "--card-hue": String(hue) } as CSSProperties)}
      className={cn(
        "cursor-pointer rounded-md border px-1.5 py-0.5 font-mono text-[.625rem] leading-4 transition-colors",
        hue === null ? "border-border bg-muted text-muted-foreground" : "board-filter-chip-hued",
        active && "outline-[1.5px] outline-solid outline-foreground/60 -outline-offset-1",
      )}
    >
      {label}
    </button>
  );
}

function BoardFilteredEmpty({ onClearFilters }: { readonly onClearFilters: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4">
      <p className="text-xs text-muted-foreground">No issues match the active filters.</p>
      <Button size="compact" variant="outline" onClick={onClearFilters}>
        Clear filters
      </Button>
    </div>
  );
}

export function BoardView({
  environmentId,
  cwd,
  onOpenFullPage,
  onOpenInPanel,
  className,
}: BoardViewProps) {
  const snapshotAtom = todoBoardSubscribe({ environmentId, input: { cwd } });
  const snapshotQuery = useEnvironmentQuery(snapshotAtom);
  const snapshotResult = useAtomValue(snapshotAtom);
  const boardLoadState =
    snapshotResult._tag === "Failure" ? classifyTodoBoardFailure(snapshotResult.cause) : null;
  const boardBootstrap = cwd.length > 0 && boardLoadState === "bootstrap";
  const navigate = useNavigate();
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

  const model = useMemo(() => {
    if (snapshotQuery.data !== null) return buildBoardViewModel(snapshotQuery.data, uiState);
    if (boardBootstrap) return buildBoardViewModel(EMPTY_BOARD_SNAPSHOT, uiState);
    return null;
  }, [snapshotQuery.data, boardBootstrap, uiState]);
  const issuesById = useMemo(
    () => new Map((snapshotQuery.data?.issues ?? []).map((issue) => [issue.id, issue] as const)),
    [snapshotQuery.data],
  );
  const selectedIssue = selectedIssueId === null ? null : (issuesById.get(selectedIssueId) ?? null);
  const focusGraph = useMemo(
    () =>
      snapshotQuery.data === null || selectedIssue === null
        ? null
        : buildFocusGraph(snapshotQuery.data.issues, selectedIssue.id),
    [snapshotQuery.data, selectedIssue],
  );
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
  const selectedIssueViewDiff = useMemo(() => {
    if (selectedIssue === null) return null;
    if (selectedIssue.status !== "done" && selectedIssue.status !== "cancelled") return null;
    const association = resolveThreadAssociation(selectedIssue.body);
    if (association === null) return null;
    return { threadMissing: !shellsById.has(association.threadId) };
  }, [selectedIssue, shellsById]);
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
  const projectOptions = useMemo(
    () => listBoardProjectOptions(projects, environmentId),
    [projects, environmentId],
  );

  const totalCards = model?.columns.reduce((count, column) => count + column.cards.length, 0) ?? 0;
  const filterActive = uiState.tag !== null || isBoardFilterActive(uiState);
  const handleToggleTagSpecTerm = (term: string) => {
    updateUiState({ tagSpec: toggleTagSpecTerm(term, uiState.tagSpec) });
  };
  const clearFilters = () => updateUiState({ tag: null, tagSpec: "", query: "" });
  const changeDrawerMode = (mode: BoardDrawerMode) => updateUiState({ drawerMode: mode });

  const rollupAfterStatus = async (issue: TodoIssue, status: string) => {
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
  };

  const changeStatus = async (issue: TodoIssue, status: string) => {
    if (issue.status === status) return;
    const result = await mutate({
      environmentId,
      input: { action: "status", cwd, id: issue.id, status },
    });
    if (result._tag !== "Failure") {
      await rollupAfterStatus(issue, status);
      return;
    }
    const failure = squashAtomCommandFailure(result);
    toastManager.add({
      type: "error",
      title: `Could not move ${shortBoardId(issue.id)} to ${status}`,
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
      await rollupAfterStatus(issue, status);
      return;
    }
    const failure = squashAtomCommandFailure(result);
    toastManager.add({
      type: "error",
      title: `Could not move ${shortBoardId(issue.id)} to ${status}`,
      description:
        failure instanceof Error && failure.message.length > 0
          ? failure.message
          : "The board rejected the change.",
    });
  };

  const attemptBoardDispatch = async (params: {
    readonly dispatchKey: string;
    readonly threadId: ThreadId;
    readonly threadTitle: string;
    readonly prompt: string;
    readonly chosenProjectId: string | null;
    readonly recordAssociation?: () => void;
  }): Promise<BoardDispatchResult> => {
    const { dispatchKey, threadId, threadTitle, prompt, chosenProjectId, recordAssociation } =
      params;
    if (dispatchInFlight.has(dispatchKey)) {
      return createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.inFlight);
    }
    const project = resolveBoardDispatchProject(projects, { environmentId, cwd, chosenProjectId });
    if (project === null) {
      return createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.noProject);
    }
    const resolvedSettings = resolveProjectSettings(settings, project.id, project);
    const modelSelection =
      resolvedSettings.settings.defaultModelSelection ??
      resolveAppModelSelectionState(settings, providers);
    if (modelSelection.model.length === 0 || modelSelection === NO_PROVIDER_MODEL_SELECTION) {
      return createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.noProvider);
    }
    const runtimeMode = resolvedSettings.settings.defaultRuntimeMode ?? DEFAULT_RUNTIME_MODE;
    const createdAt = new Date().toISOString();
    recordAssociation?.();
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
    if (result._tag !== "Failure") return BOARD_DISPATCH_STARTED;
    setDispatchThreads((prev) => {
      const next = { ...prev };
      delete next[dispatchKey];
      return next;
    });
    return boardStartFailure(squashAtomCommandFailure(result));
  };

  const logBoardDispatchResult = (
    result: BoardDispatchResult,
    dispatchKey: string,
  ): BoardDispatchResult => {
    if (result.status === "failed") {
      console.warn(
        BOARD_DISPATCH_FAILED_LOG_MESSAGE,
        boardDispatchFailureLogFields({ failure: result, cwd, dispatchKey }),
      );
    }
    return result;
  };

  const runBoardDispatch = async (
    params: Parameters<typeof attemptBoardDispatch>[0],
  ): Promise<BoardDispatchResult> =>
    logBoardDispatchResult(await attemptBoardDispatch(params), params.dispatchKey);

  const recordDispatchAssociation = (
    issueId: string,
    threadId: ThreadId,
    mode: BoardDropActionMode,
  ) => {
    void (async () => {
      const result = await mutate({
        environmentId,
        input: {
          action: "comment",
          cwd,
          id: issueId,
          text: composeThreadAssociationComment(threadId, mode),
          by: BOARD_DISPATCH_ACTOR,
        },
      });
      if (result._tag !== "Failure") return;
      const failure = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: `Dispatched ${issueId} but the diff association was not recorded`,
        description:
          failure instanceof Error && failure.message.length > 0
            ? failure.message
            : "The board rejected the comment.",
      });
    })();
  };

  const dispatchBoardAction = async (
    issue: TodoIssue,
    mode: BoardDropActionMode,
    notes: string | null,
  ) => {
    const threadId = newThreadId();
    const result = await runBoardDispatch({
      dispatchKey: issue.id,
      threadId,
      threadTitle: `todo ${issue.id}`,
      prompt: composeBoardDispatchPrompt(issue.id, mode, notes),
      chosenProjectId: null,
      recordAssociation: () => recordDispatchAssociation(issue.id, threadId, mode),
    });
    if (result.status === "failed") toastManager.add(boardDispatchFailureToast(issue.id, result));
  };

  const dispatchNewTask = async ({
    idea,
    projectId,
    threadId,
  }: BoardAddTaskSubmission): Promise<BoardDispatchResult> => {
    const prompt = composeBoardNewTaskPrompt(idea);
    if (prompt === null) {
      return logBoardDispatchResult(
        createBoardDispatchFailure(BOARD_DISPATCH_FAILURE_CODE.emptyPrompt),
        BOARD_NEW_TASK_DISPATCH_KEY,
      );
    }
    return runBoardDispatch({
      dispatchKey: BOARD_NEW_TASK_DISPATCH_KEY,
      threadId,
      threadTitle: composeBoardNewTaskTitle(idea),
      prompt,
      chosenProjectId: projectId,
    });
  };

  const submitNewTask = async (submission: BoardAddTaskSubmission) => {
    const result = await dispatchNewTask(submission);
    if (shouldCloseAddTaskDialog(result)) setAddTaskOpen(false);
    return result;
  };

  const openRecordedDiff = (issue: TodoIssue) => {
    const association = resolveThreadAssociation(issue.body);
    if (association === null) return;
    if (!shellsById.has(association.threadId)) {
      toastManager.add({
        type: "error",
        title: `The thread recorded for ${issue.id} is gone`,
        description: "It was deleted, so its diff is no longer reachable.",
      });
      return;
    }
    const threadRef = scopeThreadRef(environmentId, association.threadId);
    useRightPanelStore.getState().open(threadRef, "diff");
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
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

  const showMissing = boardLoadState === "unavailable";

  const issueDetail: BoardSplitDetail | null =
    selectedIssue === null
      ? null
      : {
          key: selectedIssue.id,
          render: (splitMode) => (
            <BoardIssuePane
              issue={selectedIssue}
              splitMode={splitMode}
              drawerMode={uiState.drawerMode}
              statusOptions={statusOptions}
              boardTags={model?.tags ?? []}
              dispatchInFlight={dispatchInFlight.has(selectedIssue.id)}
              viewDiff={selectedIssueViewDiff}
              focusGraph={focusGraph}
              onFocusIssue={setSelectedIssueId}
              onDrawerModeChange={changeDrawerMode}
              onStatusChange={(issue, status) => void changeStatus(issue, status)}
              onDispatch={(issue, mode) => setConfirmDispatch({ issue, mode })}
              onComment={addComment}
              onTagAdd={addTag}
              onTagRemove={removeTag}
              onViewDiff={() => openRecordedDiff(selectedIssue)}
              onClose={() => setSelectedIssueId(null)}
            />
          ),
        };

  const wasBootstrapRef = useRef(false);
  useEffect(() => {
    const wasBootstrap = wasBootstrapRef.current;
    wasBootstrapRef.current = boardBootstrap;
    if (boardBootstrap && !wasBootstrap) setAddTaskOpen(true);
    const hasSnapshot = snapshotQuery.data !== null;
    if (shouldAutoCloseAddTask({ wasBootstrap, boardBootstrap, hasSnapshot })) {
      setAddTaskOpen(false);
    }
  }, [boardBootstrap, snapshotQuery.data]);

  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">
            {model !== null && model.repoName.length > 0 ? model.repoName : "Board"}
          </div>
          {resolvedRoot !== null ? (
            <div className="truncate font-mono text-[.6rem] text-muted-foreground/60">
              {resolvedRoot}
            </div>
          ) : null}
        </div>
        {model !== null ? (
          <>
            <BoardMenuControl
              label={
                BOARD_VIEW_OPTIONS.find((option) => option.value === uiState.view)?.label ??
                "Columns"
              }
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
            {snapshotQuery.data === null && !boardBootstrap ? null : (
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
      {model !== null ? (
        <div className="flex shrink-0 flex-col gap-1.5 border-b border-border/50 px-3 py-2">
          <div className="flex items-center gap-1">
            <Input
              size="compact"
              className="max-w-64 flex-1"
              placeholder="Filter by tag or short id"
              aria-label="Filter issues by text"
              value={uiState.query}
              onChange={(event) => updateUiState({ query: event.currentTarget.value })}
            />
            {filterActive ? (
              <Button
                size="compact"
                variant="ghost-muted"
                aria-label="Clear all board filters"
                onClick={clearFilters}
              >
                <XIcon className="size-3.5" />
                Clear
              </Button>
            ) : null}
          </div>
          {model.epics.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {model.epics.map((epicFilter) => (
                <BoardFilterChip
                  key={epicFilter.epic}
                  label={epicFilter.epic}
                  hue={epicFilter.hue}
                  active={isQuickFilterActive(epicFilter.epic, uiState)}
                  onClick={() => handleToggleTagSpecTerm(epicFilter.epic)}
                />
              ))}
            </div>
          ) : null}
          {model.commonTags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {model.commonTags.map((tag) => (
                <BoardFilterChip
                  key={tag}
                  label={tag}
                  hue={null}
                  active={isQuickFilterActive(tag, uiState)}
                  onClick={() => handleToggleTagSpecTerm(tag)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {showMissing ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <p className="text-xs text-muted-foreground">No .todo board resolves here.</p>
        </div>
      ) : uiState.view === "archive" ? (
        <ArchiveView
          environmentId={environmentId}
          cwd={cwd}
          drawerMode={uiState.drawerMode}
          onDrawerModeChange={changeDrawerMode}
        />
      ) : model === null ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <p className="text-xs text-muted-foreground">{"Loading board\u2026"}</p>
        </div>
      ) : (
        <BoardSplitLayout
          drawerMode={uiState.drawerMode}
          detail={issueDetail}
          onClose={() => setSelectedIssueId(null)}
          primary={
            totalCards === 0 && filterActive ? (
              <BoardFilteredEmpty onClearFilters={clearFilters} />
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
                            selected={card.issue.id === selectedIssue?.id}
                            onOpen={() => setSelectedIssueId(card.issue.id)}
                          />
                        ))}
                      </BoardColumnCards>
                    </div>
                  ))}
                </div>
                <BoardDragPreview model={model} progressByIssueId={progressByIssueId} />
              </DndContext>
            )
          }
        />
      )}
      {addTaskOpen ? (
        <BoardAddTaskDialog
          pending={newTaskProgress !== null}
          projectOptions={projectOptions}
          onConfirm={submitNewTask}
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
    </div>
  );
}
