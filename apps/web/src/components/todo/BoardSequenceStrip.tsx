import { useDndContext, useDroppable } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { XIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  isSequenceChipDragId,
  isSequenceDropId,
  sequenceChipDragId,
  SEQUENCE_STRIP_DROP_ID,
  type SequenceChip,
  type SequenceStrip,
} from "./boardSequence.logic";

const FALLBACK_CHIP_TONE = "bg-card border-muted-foreground/40";

const CHIP_TONE_BY_STATUS: Record<string, string> = {
  backlog: FALLBACK_CHIP_TONE,
  read: "bg-info/15 border-info/50",
  doing: "bg-primary/15 border-primary/50",
  blocked: "bg-error/15 border-error/50",
  done: "bg-success/15 border-success/50",
  cancelled: "bg-muted border-muted-foreground/30",
};

const chipClassName = (chip: SequenceChip) =>
  cn(
    "flex shrink-0 items-start gap-0.5 rounded-md border pe-0.5",
    CHIP_TONE_BY_STATUS[chip.status] ?? FALLBACK_CHIP_TONE,
    !chip.matches && "opacity-45 hover:opacity-100",
  );

const CHIP_OPEN_CLASS = "flex min-w-0 flex-col items-start py-1 ps-2 pe-1 text-left";

function SequenceChipLabel({ chip }: { readonly chip: SequenceChip }) {
  return (
    <>
      <span className="font-mono text-sm leading-tight font-semibold text-foreground/80">
        {chip.shortId}
      </span>
      <span className="line-clamp-2 max-w-21 text-xs leading-tight break-words text-foreground/70">
        {chip.title}
      </span>
    </>
  );
}

const NextSequenceChip = memo(function NextSequenceChip({
  chip,
  readOnly,
  onOpen,
  onRemove,
}: {
  readonly chip: SequenceChip;
  readonly readOnly: boolean;
  readonly onOpen: (issueId: string) => void;
  readonly onRemove: (issueId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sequenceChipDragId(chip.id) });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(chipClassName(chip), isDragging && "opacity-40")}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        onClick={() => onOpen(chip.id)}
        className={cn(CHIP_OPEN_CLASS, isDragging ? "cursor-grabbing" : "cursor-grab")}
      >
        <SequenceChipLabel chip={chip} />
      </button>
      {readOnly ? null : (
        <Button
          size="icon-tiny"
          variant="ghost-muted"
          className="mt-0.5"
          aria-label={`Remove ${chip.shortId} from the sequence`}
          onClick={() => onRemove(chip.id)}
        >
          <XIcon />
        </Button>
      )}
    </li>
  );
});

function useCardOverSequence() {
  const { active, over } = useDndContext();
  if (active === null || over === null) return false;
  return !isSequenceChipDragId(String(active.id)) && isSequenceDropId(String(over.id));
}

export const BoardSequenceStrip = memo(function BoardSequenceStrip({
  strip,
  readOnly,
  onOpen,
  onRemove,
}: {
  readonly strip: SequenceStrip;
  readonly readOnly: boolean;
  readonly onOpen: (issueId: string) => void;
  readonly onRemove: (issueId: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: SEQUENCE_STRIP_DROP_ID });
  const cardOver = useCardOverSequence();
  const nextDragIds = strip.next.map((chip) => sequenceChipDragId(chip.id));
  return (
    <section
      ref={setNodeRef}
      aria-label="Planned sequence"
      className={cn(
        "flex shrink-0 items-center gap-2 overflow-x-auto border-t border-border/50 px-3 py-1.5",
        cardOver && "outline-2 outline-dashed outline-primary -outline-offset-4",
      )}
    >
      <SortableContext items={nextDragIds} strategy={horizontalListSortingStrategy}>
        <ul aria-label="Next" className="flex shrink-0 items-stretch gap-1.5">
          {strip.next.map((chip) => (
            <NextSequenceChip
              key={chip.id}
              chip={chip}
              readOnly={readOnly}
              onOpen={onOpen}
              onRemove={onRemove}
            />
          ))}
        </ul>
      </SortableContext>
      {strip.next.length === 0 && !readOnly ? (
        <p className="shrink-0 text-3xs text-muted-foreground/70">
          Drag a card here to plan what comes next
        </p>
      ) : null}
    </section>
  );
});
