import { describe, expect, it } from "vite-plus/test";

import { shouldUseRightPanelSheetLayout } from "./rightPanelLayout";

describe("shouldUseRightPanelSheetLayout", () => {
  it("keeps the web browser breakpoint unchanged at device pixel ratio 1", () => {
    expect(
      shouldUseRightPanelSheetLayout({ viewportWidth: 1280, devicePixelRatio: 1 }, false),
    ).toBe(false);
    expect(shouldUseRightPanelSheetLayout({ viewportWidth: 981, devicePixelRatio: 1 }, false)).toBe(
      false,
    );
    expect(shouldUseRightPanelSheetLayout({ viewportWidth: 980, devicePixelRatio: 1 }, false)).toBe(
      true,
    );
    expect(shouldUseRightPanelSheetLayout({ viewportWidth: 900, devicePixelRatio: 1 }, false)).toBe(
      true,
    );
  });

  it("keeps a maximised high-dpi desktop window on the inline host", () => {
    expect(shouldUseRightPanelSheetLayout({ viewportWidth: 960, devicePixelRatio: 2 }, true)).toBe(
      false,
    );
    expect(
      shouldUseRightPanelSheetLayout({ viewportWidth: 853, devicePixelRatio: 1.5 }, true),
    ).toBe(false);
  });

  it("keeps genuinely narrow desktop windows on the sheet host", () => {
    expect(shouldUseRightPanelSheetLayout({ viewportWidth: 450, devicePixelRatio: 2 }, true)).toBe(
      true,
    );
    expect(shouldUseRightPanelSheetLayout({ viewportWidth: 960, devicePixelRatio: 1 }, true)).toBe(
      true,
    );
  });

  it("keeps the inline host across maximise and restore-down at high dpi", () => {
    const maximised = { viewportWidth: 960, devicePixelRatio: 2 };
    expect(shouldUseRightPanelSheetLayout(maximised, true)).toBe(false);
    const restored = { viewportWidth: 640, devicePixelRatio: 2 };
    expect(shouldUseRightPanelSheetLayout(restored, true)).toBe(false);
    const narrowed = { viewportWidth: 450, devicePixelRatio: 2 };
    expect(shouldUseRightPanelSheetLayout(narrowed, true)).toBe(true);
  });
});
