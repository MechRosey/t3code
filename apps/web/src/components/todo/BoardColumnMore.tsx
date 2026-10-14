import { useEffect, useRef } from "react";

import { Button } from "../ui/button";
import { BOARD_COLUMN_REVEAL_STEP } from "./boardColumnWindow.logic";

const BOARD_COLUMN_REVEAL_ROOT_MARGIN = "200px";

export interface BoardColumnMoreProps {
  readonly status: string;
  readonly mountedCount: number;
  readonly hiddenCount: number;
  readonly onReveal: (status: string, mountedCount: number) => void;
}

export function BoardColumnMore({
  status,
  mountedCount,
  hiddenCount,
  onReveal,
}: BoardColumnMoreProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = ref.current;
    if (button === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReveal(status, mountedCount);
      },
      { rootMargin: BOARD_COLUMN_REVEAL_ROOT_MARGIN },
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, [status, mountedCount, onReveal]);
  return (
    <Button
      ref={ref}
      size="compact"
      variant="ghost-muted"
      onClick={() => onReveal(status, mountedCount)}
    >
      {`Show ${Math.min(hiddenCount, BOARD_COLUMN_REVEAL_STEP)} more`}
    </Button>
  );
}
