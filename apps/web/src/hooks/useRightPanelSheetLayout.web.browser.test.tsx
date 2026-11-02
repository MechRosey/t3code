import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../test/render";
import { useRightPanelSheetLayout } from "./useRightPanelSheetLayout";

vi.mock("~/env", () => ({ isElectron: false }));

const INLINE_WIDTH = 1280;
const SHEET_WIDTH = 900;
const HIGH_DENSITY_RATIO = 2;
const NARROW_CSS_WIDTH = 600;

function Probe() {
  return <output>{String(useRightPanelSheetLayout())}</output>;
}

const usesSheet = (container: HTMLElement) =>
  container.querySelector("output")!.textContent === "true";

function stubViewport() {
  const viewport = { innerWidth: INLINE_WIDTH, devicePixelRatio: 1 };
  const width = vi.spyOn(window, "innerWidth", "get").mockImplementation(() => viewport.innerWidth);
  const ratio = vi
    .spyOn(window, "devicePixelRatio", "get")
    .mockImplementation(() => viewport.devicePixelRatio);
  return Object.assign(viewport, {
    [Symbol.dispose]() {
      ratio.mockRestore();
      width.mockRestore();
    },
  });
}

async function resizeTo(viewport: { innerWidth: number }, width: number) {
  await act(() => {
    viewport.innerWidth = width;
    window.dispatchEvent(new Event("resize"));
  });
}

it("follows the CSS viewport width on resize and ignores the display scale outside the desktop shell", async () => {
  using viewport = stubViewport();
  using matchMedia = vi.spyOn(window, "matchMedia");
  viewport.devicePixelRatio = HIGH_DENSITY_RATIO;

  await using screen = await render(<Probe />);
  expect(usesSheet(screen.container)).toBe(false);

  await resizeTo(viewport, SHEET_WIDTH);
  expect(usesSheet(screen.container)).toBe(true);

  await resizeTo(viewport, NARROW_CSS_WIDTH);
  expect(usesSheet(screen.container)).toBe(true);

  await resizeTo(viewport, INLINE_WIDTH);
  expect(usesSheet(screen.container)).toBe(false);
  expect(matchMedia).not.toHaveBeenCalled();
});
