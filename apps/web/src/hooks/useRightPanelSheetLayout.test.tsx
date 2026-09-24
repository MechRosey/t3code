import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { useRightPanelSheetLayout } from "./useRightPanelSheetLayout";

const electron = vi.hoisted(() => ({ enabled: false }));

vi.mock("~/env", () => ({
  get isElectron() {
    return electron.enabled;
  },
}));

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
  electron.enabled = false;
  vi.unstubAllGlobals();
});

it("flips between inline and sheet host as the window resizes across the breakpoint", () => {
  expect(usesSheet).toBe(false);

  resizeTo(SHEET_WIDTH);
  expect(usesSheet).toBe(true);

  resizeTo(INLINE_WIDTH);
  expect(usesSheet).toBe(false);
});

it("re-arms the resolution query and flips the host when devicePixelRatio changes without a resize", () => {
  electron.enabled = true;
  const queries: string[] = [];
  const armed: EventTarget[] = [];
  fakeWindow = Object.assign(new EventTarget(), {
    innerWidth: SHEET_WIDTH,
    devicePixelRatio: 1,
    matchMedia: (query: string) => {
      queries.push(query);
      const media = Object.assign(new EventTarget(), { matches: false });
      armed.push(media);
      return media;
    },
  });
  vi.stubGlobal("window", fakeWindow);
  act(() => {
    renderer = create(<Probe />);
  });
  expect(usesSheet).toBe(true);
  expect(queries).toEqual(["(resolution: 1dppx)", "(resolution: 1dppx)"]);

  act(() => {
    fakeWindow.devicePixelRatio = 2;
    armed.forEach((media) => media.dispatchEvent(new Event("change")));
  });
  expect(usesSheet).toBe(false);
  expect(queries).toEqual([
    "(resolution: 1dppx)",
    "(resolution: 1dppx)",
    "(resolution: 2dppx)",
    "(resolution: 2dppx)",
  ]);
});
