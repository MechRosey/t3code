import {
  useDndContext,
  useDndMonitor,
  useDraggable,
  useDroppable,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { XIcon } from "lucide-react";
import { memo, useState } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  chipDropZone,
  isSequenceChipDragId,
  isSequenceDropId,
  sequenceChipDragId,
  SEQUENCE_STRIP_DROP_ID,
  type ChipDropZone,
  type SequenceChip,
  type SequenceSlot,
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
    "flex items-start gap-0.5 rounded-md border pe-0.5",
    CHIP_TONE_BY_STATUS[chip.status] ?? FALLBACK_CHIP_TONE,
  );

const CHIP_OPEN_CLASS = "flex min-w-0 flex-col items-start py-1 ps-2 pe-1 text-left";

type InsertSide = Exclude<ChipDropZone, "join">;

interface SlotDropHover {
  readonly chipId: string;
  readonly zone: ChipDropZone;
}

const sameHover = (left: SlotDropHover | null, right: SlotDropHover | null) =>
  left?.chipId === right?.chipId && left?.zone === right?.zone;

function slotDropHover(
  chips: ReadonlyArray<SequenceChip>,
  { active, over }: DragMoveEvent,
): SlotDropHover | null {
  if (over === null) return null;
  const overId = String(over.id);
  const chip = chips.find((candidate) => sequenceChipDragId(candidate.id) === overId);
  if (chip === undefined) return null;
  const zone = chipDropZone(active.rect.current.translated, over.rect);
  const joinsItself = zone === "join" && String(active.id) === overId;
  return joinsItself ? null : { chipId: chip.id, zone };
}

function useSlotDropHover(chips: ReadonlyArray<SequenceChip>) {
  const [hover, setHover] = useState<SlotDropHover | null>(null);
  const track = (event: DragMoveEvent) => {
    const next = slotDropHover(chips, event);
    setHover((current) => (sameHover(current, next) ? current : next));
  };
  const clear = () => setHover(null);
  useDndMonitor({ onDragMove: track, onDragOver: track, onDragEnd: clear, onDragCancel: clear });
  return hover;
}

function InsertMarker({ side }: { readonly side: InsertSide }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 w-0.5 rounded-full bg-primary",
        side === "before" ? "-left-1" : "-right-1",
      )}
    />
  );
}

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

function SequenceChipItem({
  chip,
  readOnly,
  dropHint,
  onOpen,
  onRemove,
}: {
  readonly chip: SequenceChip;
  readonly readOnly: boolean;
  readonly dropHint: ChipDropZone | null;
  readonly onOpen: (issueId: string) => void;
  readonly onRemove: (issueId: string) => void;
}) {
  const dragId = sequenceChipDragId(chip.id);
  const { setNodeRef: setDropNodeRef } = useDroppable({ id: dragId, disabled: readOnly });
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useDraggable({ id: dragId, disabled: readOnly });
  return (
    <li
      ref={setDropNodeRef}
      className={cn("relative flex shrink-0", !chip.matches && "opacity-45 hover:opacity-100")}
    >
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform) }}
        className={cn(
          chipClassName(chip),
          isDragging && "opacity-40",
          dropHint === "join" && "ring-2 ring-primary",
        )}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          onClick={() => onOpen(chip.id)}
          className={cn(
            CHIP_OPEN_CLASS,
            !readOnly && (isDragging ? "cursor-grabbing" : "cursor-grab"),
          )}
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
      </div>
      {dropHint === "before" || dropHint === "after" ? <InsertMarker side={dropHint} /> : null}
    </li>
  );
}

const SequenceSlotItem = memo(function SequenceSlotItem({
  slot,
  readOnly,
  onOpen,
  onRemove,
}: {
  readonly slot: SequenceSlot;
  readonly readOnly: boolean;
  readonly onOpen: (issueId: string) => void;
  readonly onRemove: (issueId: string) => void;
}) {
  const hover = useSlotDropHover(slot.chips);
  const grouped = slot.chips.length > 1;
  const chipHint = (chip: SequenceChip): ChipDropZone | null => {
    if (hover?.chipId !== chip.id) return null;
    return grouped && hover.zone !== "join" ? null : hover.zone;
  };
  const chips = slot.chips.map((chip) => (
    <SequenceChipItem
      key={chip.id}
      chip={chip}
      readOnly={readOnly}
      dropHint={chipHint(chip)}
      onOpen={onOpen}
      onRemove={onRemove}
    />
  ));
  if (!grouped) return chips;
  const groupInsertSide = hover === null || hover.zone === "join" ? null : hover.zone;
  return (
    <li className="relative flex shrink-0 rounded-lg border border-dashed border-muted-foreground/40 p-0.5">
      <ul aria-label="Parallel group" className="flex items-stretch gap-1">
        {chips}
      </ul>
      {groupInsertSide === null ? null : <InsertMarker side={groupInsertSide} />}
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
  const { setNodeRef } = useDroppable({ id: SEQUENCE_STRIP_DROP_ID, disabled: readOnly });
  const cardOver = useCardOverSequence();
  return (
    <section
      ref={setNodeRef}
      aria-label="Planned sequence"
      className={cn(
        "flex shrink-0 items-center gap-2 overflow-x-auto border-t border-border/50 px-3 py-1.5",
        cardOver && "outline-2 outline-dashed outline-primary -outline-offset-4",
      )}
    >
      <ul aria-label="Next" className="flex shrink-0 items-center gap-1.5">
        {strip.next.map((slot) => (
          <SequenceSlotItem
            key={slot.chips[0]?.id}
            slot={slot}
            readOnly={readOnly}
            onOpen={onOpen}
            onRemove={onRemove}
          />
        ))}
      </ul>
      {strip.next.length === 0 && !readOnly ? (
        <p className="shrink-0 text-3xs text-muted-foreground/70">
          Drag a card here to plan what comes next
        </p>
      ) : null}
    </section>
  );
});
