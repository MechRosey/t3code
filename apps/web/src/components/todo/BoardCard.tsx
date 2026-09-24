import { DragOverlay, useDraggable, useDndContext } from "@dnd-kit/core";
import { CheckIcon, CopyIcon } from "lucide-react";
import type { TodoIssue } from "@t3tools/contracts";
import {
  cardHueStyle,
  type BoardCardViewModel,
  type BoardViewModel,
} from "@t3tools/client-runtime/state/todo-board-view";

import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { shortBoardId } from "./boardCopy.logic";
import type { BoardDispatchProgress } from "./boardDrop.logic";

const BOARD_CARD_BLOCKER_CAP = 4;

export function CopyIssueIdButton({
  issue,
  className,
}: {
  readonly issue: TodoIssue;
  readonly className?: string;
}) {
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
    <Button
      type="button"
      size="icon-sm"
      variant="ghost-muted"
      aria-label={isCopied ? `Copied ${shortId}` : `Copy issue id ${shortId}`}
      title={isCopied ? `Copied ${shortId}` : `Copy the issue id ${shortId}`}
      data-copied={isCopied ? "true" : undefined}
      className={className}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={() => copyToClipboard(shortId)}
    >
      {isCopied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </Button>
  );
}

export function BoardCard({
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
        "relative block w-full cursor-grab rounded-lg border p-2 text-left shadow-xs transition-colors hover:border-foreground/30",
        card.tinted ? (card.isRoot ? "board-card-root" : "board-card-child") : "bg-card/70",
        card.issue.status === "blocked" && "board-card-blocked",
      )}
    >
      <span className="block text-xs font-medium break-words text-foreground/90">
        {card.issue.title}
      </span>
      {card.parent !== null ? (
        <div className="mt-1 flex min-w-0">
          <span
            title={card.parent.title}
            className="truncate text-[.625rem] leading-4 text-muted-foreground/70"
          >
            {shortBoardId(card.parent.id)}
          </span>
        </div>
      ) : null}
      {card.blockedBy.length > 0 ? (
        <div className="mt-1 flex min-w-0 flex-col gap-0.5">
          {card.blockedBy.slice(0, BOARD_CARD_BLOCKER_CAP).map((blocker) => (
            <span
              key={blocker.id}
              className="min-w-0 truncate text-[.625rem] leading-4 text-error/90"
              title={`Blocked by ${shortBoardId(blocker.id)} ${blocker.title}`}
            >
              {"\u276f"} {shortBoardId(blocker.id)}
            </span>
          ))}
          {card.blockedBy.length > BOARD_CARD_BLOCKER_CAP ? (
            <span className="text-[.625rem] leading-4 text-error/90">
              +{card.blockedBy.length - BOARD_CARD_BLOCKER_CAP}
            </span>
          ) : null}
        </div>
      ) : null}
      {progress !== null ? (
        <div className="mt-1 flex items-center gap-1 text-[.625rem] leading-4 text-primary">
          <Spinner className="size-3" />
          {progress === "starting" ? "dispatching" : "agent running"}
        </div>
      ) : null}
      <div className="mt-1.5 flex items-center gap-1">
        <span
          title={card.issue.title}
          className="shrink-0 font-mono text-[.625rem] leading-4 font-bold text-foreground/70"
        >
          {shortBoardId(card.issue.id)}
        </span>
        {card.issue.tags.length > 0 ? (
          <div className="flex min-w-0 flex-wrap gap-1">
            {card.issue.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-sm bg-muted px-1 text-[.625rem] leading-4 text-muted-foreground/70"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {card.badges.map((badge) => (
            <span
              key={badge.label}
              title={badge.title}
              className={cn(
                "rounded-sm px-0.5 font-mono text-[.625rem] leading-4",
                badge.state === "filled" && "bg-muted text-foreground",
                badge.state === "hollow" && "border border-foreground/60 text-muted-foreground/40",
                badge.state === "ghost" && "text-muted-foreground/40",
              )}
            >
              {badge.label}
            </span>
          ))}
          {card.badge !== null ? (
            <span
              title={card.badge === "human" ? "Open question for a human" : "Open question"}
              className={cn(
                "rounded-full px-1 text-[.625rem] leading-4 font-bold",
                card.badge === "human"
                  ? "bg-error text-white"
                  : "bg-warning text-warning-foreground",
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
        </span>
      </div>
    </button>
  );
}

export function BoardDraggableCard({
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
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("group/card relative", isDragging && "cursor-grabbing opacity-40")}
    >
      <BoardCard card={card} onOpen={onOpen} progress={progress} />
      <CopyIssueIdButton
        issue={card.issue}
        className="absolute end-1 top-1 z-10 opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100 data-[copied=true]:opacity-100"
      />
    </div>
  );
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
        <BoardCard card={card} progress={progressByIssueId[issueId] ?? null} onOpen={() => {}} />
      </div>
    </DragOverlay>
  );
}
