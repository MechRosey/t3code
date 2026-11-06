import { DragOverlay, useDndContext, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
import { CheckIcon, CopyIcon } from "lucide-react";
import { memo, type ReactNode } from "react";
import type { TodoIssue } from "@t3tools/contracts";
import {
  cardHueStyle,
  type BoardCardRelation,
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

const BOARD_CARD_RELATION_SLOTS = 4;
const BOARD_CARD_RELATION_OVERFLOW_VISIBLE = BOARD_CARD_RELATION_SLOTS - 1;
const BOARD_CARD_RELATION_GLYPH = "\u276f";

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

function capRelations(relations: ReadonlyArray<BoardCardRelation>) {
  if (relations.length <= BOARD_CARD_RELATION_SLOTS) {
    return { shown: relations, hidden: 0 };
  }
  return {
    shown: relations.slice(0, BOARD_CARD_RELATION_OVERFLOW_VISIBLE),
    hidden: relations.length - BOARD_CARD_RELATION_OVERFLOW_VISIBLE,
  };
}

function RelationId({
  relation,
  tooltipPrefix,
  glyph,
}: {
  readonly relation: BoardCardRelation;
  readonly tooltipPrefix: string;
  readonly glyph?: "before" | "after";
}) {
  return (
    <TooltipSpan
      className={cn(
        "max-w-full truncate text-3xs leading-4 text-muted-foreground/70",
        relation.closed && "line-through",
      )}
      tooltip={`${tooltipPrefix} ${shortBoardId(relation.id)}${relation.closed ? " (closed)" : ""} ${relation.title}`}
    >
      {glyph === "before" ? `${BOARD_CARD_RELATION_GLYPH} ` : null}
      {shortBoardId(relation.id)}
      {glyph === "after" ? ` ${BOARD_CARD_RELATION_GLYPH}` : null}
    </TooltipSpan>
  );
}

function RelationOverflow({ hidden }: { readonly hidden: number }) {
  return hidden > 0 ? (
    <span className="text-3xs leading-4 text-muted-foreground/70">+{hidden}</span>
  ) : null;
}

function RelationColumn({
  relations,
  side,
  tooltipPrefix,
}: {
  readonly relations: ReadonlyArray<BoardCardRelation>;
  readonly side: "left" | "right";
  readonly tooltipPrefix: string;
}) {
  const { shown, hidden } = capRelations(relations);
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-0.5", side === "left" ? "items-end" : "items-start")}
    >
      {shown.map((relation) => (
        <RelationId
          key={relation.id}
          relation={relation}
          tooltipPrefix={tooltipPrefix}
          glyph={side === "left" ? "after" : "before"}
        />
      ))}
      <RelationOverflow hidden={hidden} />
    </div>
  );
}

function RelationRow({
  relations,
  tooltipPrefix,
}: {
  readonly relations: ReadonlyArray<BoardCardRelation>;
  readonly tooltipPrefix: string;
}) {
  const { shown, hidden } = capRelations(relations);
  return (
    <div className="flex min-w-0 flex-wrap justify-center gap-x-1">
      {shown.map((relation) => (
        <RelationId key={relation.id} relation={relation} tooltipPrefix={tooltipPrefix} />
      ))}
      <RelationOverflow hidden={hidden} />
    </div>
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
      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-start gap-x-1.5">
        <RelationColumn relations={card.blockedBy} side="left" tooltipPrefix="Blocked by" />
        <div className="flex min-w-0 flex-col items-center">
          {card.parent !== null ? (
            <RelationId relation={card.parent} tooltipPrefix="Parent" />
          ) : null}
          <span className="font-mono text-xs leading-4 font-bold text-foreground/70">
            {shortBoardId(card.issue.id)}
          </span>
        </div>
        <RelationColumn relations={card.blocks} side="right" tooltipPrefix="Blocks" />
        <div className="col-span-3">
          <RelationRow relations={card.children} tooltipPrefix="Child" />
        </div>
      </div>
      {progress !== null ? (
        <div className="mt-1 flex items-center gap-1 text-3xs leading-4 text-primary">
          <Spinner className="size-3" />
          {progress === "starting" ? "dispatching" : "agent running"}
        </div>
      ) : null}
      <div className="mt-1.5 flex items-center gap-1">
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
