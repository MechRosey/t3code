export const RIGHT_PANEL_INLINE_LAYOUT_MAX_WIDTH = 980;

export type RightPanelViewport = {
  viewportWidth: number;
  devicePixelRatio: number;
};

export function shouldUseRightPanelSheetLayout(
  viewport: RightPanelViewport,
  isDesktopShell: boolean,
): boolean {
  const width = isDesktopShell
    ? viewport.viewportWidth * viewport.devicePixelRatio
    : viewport.viewportWidth;
  return width <= RIGHT_PANEL_INLINE_LAYOUT_MAX_WIDTH;
}

// Applied only while a floating preview overlaps the compact sheet.
export const RIGHT_PANEL_SHEET_LAYER_CLASS_NAME = "z-[35]";
export const RIGHT_PANEL_SHEET_CLASS_NAME =
  "w-[min(42vw,28rem)] min-w-80 max-w-[28rem] p-0 max-[760px]:w-[min(88vw,24rem)] max-[760px]:min-w-0 wco:mt-[env(titlebar-area-height)] wco:h-[calc(100%-env(titlebar-area-height))] wco:max-h-[calc(100%-env(titlebar-area-height))]";
