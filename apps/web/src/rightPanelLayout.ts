const RIGHT_PANEL_INLINE_LAYOUT_MAX_WIDTH = 980;
export const RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 980px)";

export type RightPanelViewport = {
  viewportWidth: number;
  devicePixelRatio: number;
};

export type ThreadPanelPresentation = "inline" | "popover";

export function shouldUseRightPanelSheetLayout(
  viewport: RightPanelViewport,
  isDesktopShell: boolean,
): boolean {
  const width = isDesktopShell
    ? viewport.viewportWidth * viewport.devicePixelRatio
    : viewport.viewportWidth;
  return width <= RIGHT_PANEL_INLINE_LAYOUT_MAX_WIDTH;
}
