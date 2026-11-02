import { DragOverlay, useDndContext, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
import { CheckIcon, CopyIcon } from "lucide-react";
import { memo, type ReactNode } from "react";
import type { TodoIssue } from "@t3tools/contracts";
import {
  cardHueStyle,
  type BoardCardViewModel,
  type BoardViewModel,
} from "@t3tools/client-runtime/state/todo-board-view";

import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { cn } from "~/lib/utils";
import { SidebarPointerSensor } from "../Sidebar.pointer";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { shortBoardId } from "./boardCopy.logic";
import type { BoardDispatchProgress } from "./boardDrop.logic";

const BOARD_CARD_BLOCKER_CAP = 4;

const BOARD_DRAG_ACTIVATION_DISTANCE = 6;

const ignoreDragSensorEvent = () => {};

const BOARD_DRAG_SENSOR_OPTIONS = {
  distance: BOARD_DRAG_ACTIVATION_DISTANCE,
  onAttach: ignoreDragSensorEvent,
  onFinish: ignoreDragSensorEvent,
};

const ignoreCardOpen = () => {};

function TooltipSpan({
  tooltip,
  className,
  children,
}: {
  readonly tooltip: string;
  readonly className: string;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={className} />}>{children}</TooltipTrigger>
      <TooltipPopup>{tooltip}</TooltipPopup>
    </Tooltip>
  );
}

export function CopyIssueIdButton({ issue }: { readonly issue: TodoIssue }) {
  const shortId = shortBoardId(issue.id);
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    target: "issue id",
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: `Could not copy ${shortId}`,
        description: error.message,
      });
    },
  });
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost-muted"
            aria-label={isCopied ? `Copied ${shortId}` : `Copy issue id ${shortId}`}
            data-copied={isCopied ? "true" : undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onClick={() => copyToClipboard(shortId)}
          />
        }
      >
        {isCopied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </TooltipTrigger>
      <TooltipPopup>{isCopied ? `Copied ${shortId}` : `Copy the issue id ${shortId}`}</TooltipPopup>
    </Tooltip>
  );
}

export const BoardCard = memo(function BoardCard({
  card,
  onOpen,
  progress,
  selected = false,
}: {
  readonly card: BoardCardViewModel;
  readonly onOpen: (issueId: string) => void;
  readonly progress: BoardDispatchProgress | null;
  readonly selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(card.issue.id)}
      aria-current={selected ? true : undefined}
      style={cardHueStyle(card.issue)}
      className={cn(
        "relative block w-full cursor-grab rounded-lg border p-2 text-left shadow-xs transition-colors hover:border-foreground/30",
        card.tinted ? (card.isRoot ? "board-card-root" : "board-card-child") : "bg-card/70",
        card.issue.status === "blocked" && "board-card-blocked",
        selected && "outline-2 -outline-offset-1 outline-primary",
      )}
    >
      <span className="block text-xs font-medium break-words text-foreground/90">
        {card.issue.title}
      </span>
      {card.parent !== null ? (
        <div className="mt-1 flex min-w-0">
          <TooltipSpan
            tooltip={card.parent.title}
            className="truncate text-3xs leading-4 text-muted-foreground/70"
          >
            {shortBoardId(card.parent.id)}
          </TooltipSpan>
        </div>
      ) : null}
      {card.blockedBy.length > 0 ? (
        <div className="mt-1 flex min-w-0 flex-col gap-0.5">
          {card.blockedBy.slice(0, BOARD_CARD_BLOCKER_CAP).map((blocker) => (
            <TooltipSpan
              key={blocker.id}
              className="min-w-0 truncate text-3xs leading-4 text-error/90"
              tooltip={`Blocked by ${shortBoardId(blocker.id)} ${blocker.title}`}
            >
              {"\u276f"} {shortBoardId(blocker.id)}
            </TooltipSpan>
          ))}
          {card.blockedBy.length > BOARD_CARD_BLOCKER_CAP ? (
            <span className="text-3xs leading-4 text-error/90">
              +{card.blockedBy.length - BOARD_CARD_BLOCKER_CAP}
            </span>
          ) : null}
        </div>
      ) : null}
      {progress !== null ? (
        <div className="mt-1 flex items-center gap-1 text-3xs leading-4 text-primary">
          <Spinner className="size-3" />
          {progress === "starting" ? "dispatching" : "agent running"}
        </div>
      ) : null}
      <div className="mt-1.5 flex items-center gap-1">
        <span className="shrink-0 font-mono text-xs leading-4 font-bold text-foreground/70">
          {shortBoardId(card.issue.id)}
        </span>
        {card.issue.tags.length > 0 ? (
          <div className="flex min-w-0 flex-wrap gap-1">
            {card.issue.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-sm bg-muted px-1 text-3xs leading-4 text-muted-foreground/70"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {card.badges.map((badge) => (
            <TooltipSpan
              key={badge.label}
              tooltip={badge.title}
              className={cn(
                "rounded-sm px-0.5 font-mono text-3xs leading-4",
                badge.state === "filled" && "bg-muted text-foreground",
                badge.state === "hollow" && "border border-foreground/60 text-muted-foreground/40",
                badge.state === "ghost" && "text-muted-foreground/40",
              )}
            >
              {badge.label}
            </TooltipSpan>
          ))}
          {card.badge !== null ? (
            <TooltipSpan
              tooltip={card.badge === "human" ? "Open question for a human" : "Open question"}
              className={cn(
                "rounded-full px-1 text-3xs leading-4 font-bold",
                card.badge === "human"
                  ? "bg-error text-white"
                  : "bg-warning text-warning-foreground",
              )}
            >
              ?
            </TooltipSpan>
          ) : null}
          <TooltipSpan
            tooltip={card.statusLabel}
            className={cn("shrink-0 text-xs leading-4", card.colourClass)}
          >
            <span aria-label={card.statusLabel}>{card.glyph}</span>
          </TooltipSpan>
        </span>
      </div>
    </button>
  );
});

export const BoardDraggableCard = memo(function BoardDraggableCard({
  card,
  onOpen,
  progress,
  selected,
}: {
  readonly card: BoardCardViewModel;
  readonly onOpen: (issueId: string) => void;
  readonly progress: BoardDispatchProgress | null;
  readonly selected: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `card:${card.issue.id}`,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("group/card relative", isDragging && "cursor-grabbing opacity-40")}
    >
      <BoardCard card={card} onOpen={onOpen} progress={progress} selected={selected} />
      <div className="absolute end-1 top-1 z-10 opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100 has-data-[copied=true]:opacity-100">
        <CopyIssueIdButton issue={card.issue} />
      </div>
    </div>
  );
});

export function useBoardDragSensors() {
  return useSensors(useSensor(SidebarPointerSensor, BOARD_DRAG_SENSOR_OPTIONS));
}

export function BoardDragPreview({
  model,
  progressByIssueId,
}: {
  readonly model: BoardViewModel;
  readonly progressByIssueId: Record<string, BoardDispatchProgress>;
}) {
  const { active } = useDndContext();
  if (active === null) return null;
  const issueId = String(active.id).slice("card:".length);
  const card = model.columns
    .flatMap((column) => column.cards)
    .find((columnCard) => columnCard.issue.id === issueId);
  if (card === undefined) return null;
  return (
    <DragOverlay dropAnimation={null}>
      <div className="cursor-grabbing">
        <BoardCard
          card={card}
          progress={progressByIssueId[issueId] ?? null}
          onOpen={ignoreCardOpen}
        />
      </div>
    </DragOverlay>
  );
}
