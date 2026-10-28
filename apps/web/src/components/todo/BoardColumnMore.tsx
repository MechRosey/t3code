import { Button } from "../ui/button";
import { BOARD_COLUMN_REVEAL_STEP } from "./boardColumnWindow.logic";

const BOARD_COLUMN_REVEAL_ROOT_MARGIN = "200px";

export interface BoardColumnMoreProps {
  readonly status: string;
  readonly label: string;
  readonly mountedCount: number;
  readonly hiddenCount: number;
  readonly onReveal: (status: string, mountedCount: number) => void;
}

export function BoardColumnMore({
  status,
  label,
  mountedCount,
  hiddenCount,
  onReveal,
}: BoardColumnMoreProps) {
  const revealWhenVisible = (button: HTMLButtonElement | null) => {
    if (button === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReveal(status, mountedCount);
      },
      { root: button.parentElement, rootMargin: BOARD_COLUMN_REVEAL_ROOT_MARGIN },
    );
    observer.observe(button);
    return () => observer.disconnect();
  };
  const nextCount = Math.min(hiddenCount, BOARD_COLUMN_REVEAL_STEP);
  return (
    <Button
      ref={revealWhenVisible}
      size="compact"
      variant="ghost-muted"
      aria-label={`Show ${nextCount} more ${label} cards`}
      onClick={() => onReveal(status, mountedCount)}
    >
      {`Show ${nextCount} more`}
    </Button>
  );
}
