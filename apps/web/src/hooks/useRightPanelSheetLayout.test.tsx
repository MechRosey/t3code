import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { useRightPanelSheetLayout } from "./useRightPanelSheetLayout";

const INLINE_WIDTH = 1280;
const SHEET_WIDTH = 900;

let renderer: ReactTestRenderer;
let usesSheet: boolean;
let fakeWindow: EventTarget & { innerWidth: number; devicePixelRatio: number };

function Probe() {
  const value = useRightPanelSheetLayout();
  useLayoutEffect(() => {
    usesSheet = value;
  });
  return null;
}

function resizeTo(width: number) {
  act(() => {
    fakeWindow.innerWidth = width;
    fakeWindow.dispatchEvent(new Event("resize"));
  });
}

beforeEach(() => {
  fakeWindow = Object.assign(new EventTarget(), {
    innerWidth: INLINE_WIDTH,
    devicePixelRatio: 1,
  });
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  act(() => {
    renderer = create(<Probe />);
  });
});

afterEach(() => {
  act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

it("flips between inline and sheet host as the window resizes across the breakpoint", () => {
  expect(usesSheet).toBe(false);

  resizeTo(SHEET_WIDTH);
  expect(usesSheet).toBe(true);

  resizeTo(INLINE_WIDTH);
  expect(usesSheet).toBe(false);
});
