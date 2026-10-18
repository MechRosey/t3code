import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { useRightPanelSheetLayout } from "./useRightPanelSheetLayout";

vi.mock("~/env", () => ({ isElectron: true }));

const INLINE_WIDTH = 1280;
const SHEET_WIDTH = 900;

let root: Root;
let container: HTMLDivElement;
let innerWidth = INLINE_WIDTH;
let devicePixelRatio = 1;

function Probe() {
  return <output>{String(useRightPanelSheetLayout())}</output>;
}

const usesSheet = () => container.querySelector("output")!.textContent === "true";

async function mountProbe() {
  await act(() => root.render(<Probe />));
}

async function resizeTo(width: number) {
  await act(() => {
    innerWidth = width;
    window.dispatchEvent(new Event("resize"));
  });
}

beforeEach(() => {
  innerWidth = INLINE_WIDTH;
  devicePixelRatio = 1;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "innerWidth", "get").mockImplementation(() => innerWidth);
  vi.spyOn(window, "devicePixelRatio", "get").mockImplementation(() => devicePixelRatio);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("flips between inline and sheet host as the window resizes across the breakpoint", async () => {
  await mountProbe();
  expect(usesSheet()).toBe(false);

  await resizeTo(SHEET_WIDTH);
  expect(usesSheet()).toBe(true);

  await resizeTo(INLINE_WIDTH);
  expect(usesSheet()).toBe(false);
});

it("re-arms the resolution query and flips the host when devicePixelRatio changes without a resize", async () => {
  innerWidth = SHEET_WIDTH;
  const queries: string[] = [];
  const armed: EventTarget[] = [];
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    queries.push(query);
    const media = Object.assign(new EventTarget(), { matches: false }) as MediaQueryList;
    armed.push(media);
    return media;
  });

  await mountProbe();
  expect(usesSheet()).toBe(true);
  expect(queries).toEqual(["(resolution: 1dppx)", "(resolution: 1dppx)"]);

  await act(() => {
    devicePixelRatio = 2;
    armed.forEach((media) => media.dispatchEvent(new Event("change")));
  });
  expect(usesSheet()).toBe(false);
  expect(queries).toEqual([
    "(resolution: 1dppx)",
    "(resolution: 1dppx)",
    "(resolution: 2dppx)",
    "(resolution: 2dppx)",
  ]);
});
