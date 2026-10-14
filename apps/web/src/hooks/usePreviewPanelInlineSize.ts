import type { ChatWidth } from "@t3tools/contracts/settings";
import { type RefObject, useLayoutEffect, useState } from "react";

import { DEFAULT_REM_PIXELS, resolveAutoPreviewPanelWidth } from "./previewPanelAutoWidth";
import { type ResizableWidthHandlers, useResizableWidth } from "./useResizableWidth";
import { observeResize } from "../lib/observeResize";

export interface PreviewPanelInlineSize {
  readonly width: number;
  readonly handlers: ResizableWidthHandlers;
}

const PREVIEW_PANEL_WIDTH_STORAGE_KEY = "t3code:preview-panel-width";
const PREVIEW_PANEL_MIN_WIDTH = 360;
/**
 * Upper bound as a fraction of the viewport; only binds on wide screens.
 * On narrow windows the container clamp below is what preserves the
 * sibling column's usable width.
 */
const PREVIEW_PANEL_MAX_WIDTH_FRACTION = 0.7;
/**
 * Floor for the column beside the panel: below this the chat column's
 * composer overflows, so the panel yields instead.
 */
const SIBLING_COLUMN_MIN_WIDTH = 360;
const PREVIEW_PANEL_DEFAULT_WIDTH = 540;

export interface PreviewPanelAutoWidthOptions {
  readonly chatWidth: ChatWidth;
  readonly gitCardShown: boolean;
}

interface PreviewPanelBounds {
  readonly maxWidth: number;
  readonly autoWidth: number | undefined;
}

export function usePreviewPanelInlineSize(
  hostRef?: RefObject<HTMLElement | null>,
  options: {
    readonly enabled?: boolean | undefined;
    readonly widthStorageKey?: string | undefined;
    readonly defaultWidth?: number | undefined;
    /** Measure this row instead of the panel's parent. */
    readonly container?: HTMLElement | null | undefined;
    readonly autoWidth?: PreviewPanelAutoWidthOptions | undefined;
  } = {},
): PreviewPanelInlineSize {
  const defaultWidth = options.defaultWidth ?? PREVIEW_PANEL_DEFAULT_WIDTH;
  const bounds = useViewportClampedBounds(
    hostRef,
    options.enabled ?? true,
    options.container,
    defaultWidth,
    options.autoWidth,
  );
  return useResizableWidth({
    storageKey: options.widthStorageKey ?? PREVIEW_PANEL_WIDTH_STORAGE_KEY,
    defaultWidth,
    minWidth: PREVIEW_PANEL_MIN_WIDTH,
    maxWidth: bounds.maxWidth,
    edge: "left",
    autoWidth: bounds.autoWidth,
  });
}

/**
 * Keep the resizable panel's upper bound in sync with the window AND the row
 * it sits in. Resize-aware so dragging the OS window narrower (or expanding
 * the app sidebar) re-clamps the stored width on the next render.
 */
function useViewportClampedBounds(
  hostRef: RefObject<HTMLElement | null> | undefined,
  enabled: boolean,
  container: HTMLElement | null | undefined,
  defaultWidth: number,
  autoWidthOptions: PreviewPanelAutoWidthOptions | undefined,
): PreviewPanelBounds {
  const autoChatWidth = autoWidthOptions?.chatWidth;
  const autoGitCardShown = autoWidthOptions?.gitCardShown ?? false;
  const [bounds, setBounds] = useState<PreviewPanelBounds>(() => ({
    maxWidth: getPreviewPanelMaxWidth(typeof window === "undefined" ? 1280 : window.innerWidth),
    autoWidth: undefined,
  }));
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const row = container ?? (enabled ? hostRef?.current?.parentElement : null) ?? null;
    // Measure before first paint: the persisted width must be clamped against
    // the row on the initial render, not one observer tick later (the panel
    // would flash over-wide on every mount).
    const measure = () => {
      const rowWidth = row?.clientWidth;
      const maxWidth = getPreviewPanelMaxWidth(window.innerWidth, rowWidth);
      const autoWidth =
        autoChatWidth === undefined || rowWidth === undefined
          ? undefined
          : resolveAutoPreviewPanelWidth({
              rowWidth,
              chatWidth: autoChatWidth,
              gitCardShown: autoGitCardShown,
              remPixels: readRootRemPixels(),
              minWidth: PREVIEW_PANEL_MIN_WIDTH,
              defaultWidth,
              maxWidth,
            });
      setBounds((current) =>
        current.maxWidth === maxWidth && current.autoWidth === autoWidth
          ? current
          : { maxWidth, autoWidth },
      );
    };
    measure();
    let frame = 0;
    const onResize = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    window.addEventListener("resize", onResize);
    const stopObserving = row ? observeResize(row, measure) : undefined;
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      stopObserving?.();
    };
  }, [container, hostRef, enabled, defaultWidth, autoChatWidth, autoGitCardShown]);
  return bounds;
}
function readRootRemPixels(): number {
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize : DEFAULT_REM_PIXELS;
}

export function getPreviewPanelMaxWidth(viewportWidth: number, containerWidth?: number): number {
  const fractionCap = Math.floor(viewportWidth * PREVIEW_PANEL_MAX_WIDTH_FRACTION);
  const containerCap =
    containerWidth === undefined ? Infinity : Math.floor(containerWidth) - SIBLING_COLUMN_MIN_WIDTH;
  // Never below the panel's own minimum: when the row cannot fit both
  // columns' minimums the sibling yields, and useResizableWidth's clamp must
  // not see max < min (it would resolve the inversion to min and, via
  // drag-end persistence, overwrite the user's stored width).
  return Math.max(PREVIEW_PANEL_MIN_WIDTH, Math.min(fractionCap, containerCap));
}
