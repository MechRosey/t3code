import type { ChatWidth } from "@t3tools/contracts/settings";
import { useState } from "react";

import { DEFAULT_REM_PIXELS, resolveAutoPreviewPanelWidth } from "./previewPanelAutoWidth";
import { type ResizableWidthHandlers, useResizableWidth } from "./useResizableWidth";
import { observeResize } from "../lib/observeResize";

export interface PreviewPanelInlineSize {
  readonly width: number;
  readonly handlers: ResizableWidthHandlers;
  /** Ref-callback body for the panel host: measures the row the panel shares. */
  readonly observeRow: (host: HTMLElement) => () => void;
}

const PREVIEW_PANEL_WIDTH_STORAGE_KEY = "t3code:preview-panel-width";
const PREVIEW_PANEL_MIN_WIDTH = 360;
const PREVIEW_PANEL_MAX_WIDTH_FRACTION = 0.7;
/** Below this, the sibling chat column's composer overflows. */
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
  options: {
    readonly enabled?: boolean | undefined;
    readonly widthStorageKey?: string | undefined;
    readonly defaultWidth?: number | undefined;
    readonly container?: HTMLElement | null | undefined;
    readonly autoWidth?: PreviewPanelAutoWidthOptions | undefined;
  } = {},
): PreviewPanelInlineSize {
  const enabled = options.enabled ?? true;
  const container = options.container;
  const defaultWidth = options.defaultWidth ?? PREVIEW_PANEL_DEFAULT_WIDTH;
  const autoChatWidth = options.autoWidth?.chatWidth;
  const autoGitCardShown = options.autoWidth?.gitCardShown ?? false;
  const [bounds, setBounds] = useState<PreviewPanelBounds>(() => ({
    maxWidth: getPreviewPanelMaxWidth(typeof window === "undefined" ? 1280 : window.innerWidth),
    autoWidth: undefined,
  }));
  const { width, handlers } = useResizableWidth({
    storageKey: options.widthStorageKey ?? PREVIEW_PANEL_WIDTH_STORAGE_KEY,
    defaultWidth,
    minWidth: PREVIEW_PANEL_MIN_WIDTH,
    maxWidth: bounds.maxWidth,
    edge: "left",
    autoWidth: bounds.autoWidth,
  });
  const observeRow = (host: HTMLElement) => {
    const row = container ?? (enabled ? host.parentElement : null) ?? null;
    // Ref callbacks run before paint, so the width is clamped without an over-wide
    // flash on mount. Only the derived cap is stored: the row resizes every frame
    // of a sidebar drag, but an unchanged cap skips re-rendering the owner.
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
  };
  return { width, handlers, observeRow };
}

function readRootRemPixels(): number {
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize : DEFAULT_REM_PIXELS;
}

export function getPreviewPanelMaxWidth(viewportWidth: number, containerWidth?: number): number {
  const fractionCap = Math.floor(viewportWidth * PREVIEW_PANEL_MAX_WIDTH_FRACTION);
  const containerCap =
    containerWidth === undefined ? Infinity : Math.floor(containerWidth) - SIBLING_COLUMN_MIN_WIDTH;
  // Keep max >= min; an inverted clamp would overwrite the saved width on drag end.
  return Math.max(PREVIEW_PANEL_MIN_WIDTH, Math.min(fractionCap, containerCap));
}
