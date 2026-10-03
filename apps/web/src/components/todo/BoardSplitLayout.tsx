import { ArrowLeftIcon, Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { useResizableWidth } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";
import { RightPanelResizeHandle } from "../preview/RightPanelResizeHandle";
import { Button } from "../ui/button";
import {
  ISSUE_PANE_MIN_WIDTH,
  detailWidthBounds,
  resolveSplitMode,
  type BoardSplitMode,
} from "./boardSplit.logic";
import type { BoardDrawerMode } from "./boardUiState";

const ISSUE_PANE_WIDTH_STORAGE_KEY = "t3code:board-issue-drawer-width";
const ISSUE_PANE_DEFAULT_WIDTH = 448;
const STACKED_PANE_WIDTH_BOUNDS = {
  minWidth: ISSUE_PANE_MIN_WIDTH,
  maxWidth: Number.POSITIVE_INFINITY,
};

export interface BoardSplitDetail {
  readonly key: string;
  readonly render: (splitMode: BoardSplitMode) => ReactNode;
}

function useObservedWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function useFocusReturnOnClose(detailKey: string | null, paneRef: RefObject<HTMLElement | null>) {
  const openerRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (detailKey === null || typeof document === "undefined") return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return;
    if (paneRef.current?.contains(active)) return;
    openerRef.current = active;
  }, [detailKey, paneRef]);
  useEffect(() => {
    if (detailKey !== null || typeof document === "undefined") return;
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener === null || !opener.isConnected) return;
    const focusWasDropped =
      document.activeElement === null || document.activeElement === document.body;
    if (focusWasDropped) opener.focus();
  }, [detailKey]);
}

export function BoardSplitLayout({
  primary,
  detail,
  drawerMode,
  onClose,
}: {
  readonly primary: ReactNode;
  readonly detail: BoardSplitDetail | null;
  readonly drawerMode: BoardDrawerMode;
  readonly onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const containerWidth = useObservedWidth(containerRef);
  const splitMode = resolveSplitMode(containerWidth, drawerMode);
  const stacked = splitMode === "stacked";
  const { width, handlers } = useResizableWidth({
    storageKey: ISSUE_PANE_WIDTH_STORAGE_KEY,
    defaultWidth: ISSUE_PANE_DEFAULT_WIDTH,
    edge: "left",
    ...(stacked ? STACKED_PANE_WIDTH_BOUNDS : detailWidthBounds(containerWidth)),
  });
  useFocusReturnOnClose(detail?.key ?? null, paneRef);
  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    onClose();
  };
  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
      <div hidden={detail !== null && stacked} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {primary}
      </div>
      {detail !== null ? (
        <aside
          ref={paneRef}
          aria-label="Issue details"
          onKeyDown={closeOnEscape}
          style={stacked ? undefined : { width }}
          className={cn(
            "relative flex min-h-0 flex-col bg-background",
            stacked ? "min-w-0 flex-1" : "shrink-0 border-s border-border/50",
          )}
        >
          {stacked ? null : <RightPanelResizeHandle handlers={handlers} />}
          <Fragment key={detail.key}>{detail.render(splitMode)}</Fragment>
        </aside>
      ) : null}
    </div>
  );
}

function BoardPaneHeading({ children }: { readonly children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h2 ref={ref} tabIndex={-1} className="text-base leading-tight font-semibold outline-none">
      {children}
    </h2>
  );
}

function BoardPaneSizeToggle({
  drawerMode,
  onDrawerModeChange,
}: {
  readonly drawerMode: BoardDrawerMode;
  readonly onDrawerModeChange: (mode: BoardDrawerMode) => void;
}) {
  const maximised = drawerMode === "full";
  return (
    <Button
      size="compact"
      variant="ghost-muted"
      aria-label={maximised ? "Restore the issue pane" : "Maximise the issue pane"}
      onClick={() => onDrawerModeChange(maximised ? "normal" : "full")}
    >
      {maximised ? <Minimize2Icon className="size-3.5" /> : <Maximize2Icon className="size-3.5" />}
    </Button>
  );
}

export function BoardPaneHeader({
  splitMode,
  drawerMode,
  onDrawerModeChange,
  backLabel,
  backAriaLabel,
  tools,
  title,
  description,
  onClose,
}: {
  readonly splitMode: BoardSplitMode;
  readonly drawerMode: BoardDrawerMode;
  readonly onDrawerModeChange: (mode: BoardDrawerMode) => void;
  readonly backLabel: string;
  readonly backAriaLabel: string;
  readonly tools?: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly onClose: () => void;
}) {
  const sizeToggleVisible = splitMode === "split" || drawerMode === "full";
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border/50 p-4">
      <div className="flex items-center gap-2">
        {splitMode === "stacked" ? (
          <Button size="compact" variant="ghost-muted" aria-label={backAriaLabel} onClick={onClose}>
            <ArrowLeftIcon />
            {backLabel}
          </Button>
        ) : null}
        {sizeToggleVisible ? (
          <BoardPaneSizeToggle drawerMode={drawerMode} onDrawerModeChange={onDrawerModeChange} />
        ) : null}
        {tools}
        <div className="min-w-0 flex-1" />
        {splitMode === "split" ? (
          <Button
            size="icon-sm"
            variant="ghost-muted"
            aria-label="Close the issue pane"
            onClick={onClose}
          >
            <XIcon className="size-4" />
          </Button>
        ) : null}
      </div>
      <BoardPaneHeading>{title}</BoardPaneHeading>
      <p className="font-mono text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
