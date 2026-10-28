import { ArrowLeftIcon, Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react";
import { Fragment, useState, type KeyboardEvent, type ReactNode } from "react";

import { useResizableWidth } from "~/hooks/useResizableWidth";
import { observeResize } from "~/lib/observeResize";
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

function useObservedWidth() {
  const [width, setWidth] = useState(0);
  const observe = (element: HTMLElement | null) => {
    if (element === null) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    return observeResize(element, measure);
  };
  return { width, observe };
}

function returnFocusToOpenerOnUnmount(pane: HTMLElement | null) {
  if (pane === null) return;
  const active = pane.ownerDocument.activeElement;
  const opener =
    active instanceof HTMLElement && active !== pane.ownerDocument.body ? active : null;
  return () => {
    if (opener === null) return;
    queueMicrotask(() => {
      const { activeElement, body } = opener.ownerDocument;
      const focusWasDropped = activeElement === null || activeElement === body;
      if (opener.isConnected && focusWasDropped) opener.focus();
    });
  };
}

function focusAfterCommit(element: HTMLElement | null) {
  if (element !== null) queueMicrotask(() => element.focus());
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
  const { width: containerWidth, observe } = useObservedWidth();
  const splitMode = resolveSplitMode(containerWidth, drawerMode);
  const stacked = splitMode === "stacked";
  const { width, handlers } = useResizableWidth({
    storageKey: ISSUE_PANE_WIDTH_STORAGE_KEY,
    defaultWidth: ISSUE_PANE_DEFAULT_WIDTH,
    edge: "left",
    ...(stacked ? STACKED_PANE_WIDTH_BOUNDS : detailWidthBounds(containerWidth)),
  });
  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onClose();
  };
  return (
    <div ref={observe} className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
      <div hidden={detail !== null && stacked} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {primary}
      </div>
      {detail !== null ? (
        <aside
          ref={returnFocusToOpenerOnUnmount}
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
  return (
    <h2
      ref={focusAfterCommit}
      tabIndex={-1}
      className="text-base leading-tight font-semibold outline-none"
    >
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
