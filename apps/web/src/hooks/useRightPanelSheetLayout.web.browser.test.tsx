import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { useRightPanelSheetLayout } from "./useRightPanelSheetLayout";

vi.mock("~/env", () => ({ isElectron: false }));

const INLINE_WIDTH = 1280;
const SHEET_WIDTH = 900;
const HIGH_DENSITY_RATIO = 2;
const NARROW_CSS_WIDTH = 600;

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

it("follows the CSS viewport width on resize and ignores the display scale outside the desktop shell", async () => {
  const matchMedia = vi.spyOn(window, "matchMedia");
  devicePixelRatio = HIGH_DENSITY_RATIO;

  await mountProbe();
  expect(usesSheet()).toBe(false);

  await resizeTo(SHEET_WIDTH);
  expect(usesSheet()).toBe(true);

  await resizeTo(NARROW_CSS_WIDTH);
  expect(usesSheet()).toBe(true);

  await resizeTo(INLINE_WIDTH);
  expect(usesSheet()).toBe(false);
  expect(matchMedia).not.toHaveBeenCalled();
});
