import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../test/render";
import { useRightPanelSheetLayout } from "./useRightPanelSheetLayout";

vi.mock("~/env", () => ({ isElectron: true }));

const INLINE_WIDTH = 1280;
const SHEET_WIDTH = 900;

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

it("flips between inline and sheet host as the window resizes across the breakpoint", async () => {
  using viewport = stubViewport();
  await using screen = await render(<Probe />);
  expect(usesSheet(screen.container)).toBe(false);

  await resizeTo(viewport, SHEET_WIDTH);
  expect(usesSheet(screen.container)).toBe(true);

  await resizeTo(viewport, INLINE_WIDTH);
  expect(usesSheet(screen.container)).toBe(false);
});

it("re-arms the resolution query and flips the host when devicePixelRatio changes without a resize", async () => {
  using viewport = stubViewport();
  viewport.innerWidth = SHEET_WIDTH;
  const queries: string[] = [];
  const armed: EventTarget[] = [];
  using _matchMedia = vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    queries.push(query);
    const media = Object.assign(new EventTarget(), { matches: false }) as MediaQueryList;
    armed.push(media);
    return media;
  });

  await using screen = await render(<Probe />);
  expect(usesSheet(screen.container)).toBe(true);
  expect(queries).toEqual(["(resolution: 1dppx)", "(resolution: 1dppx)"]);

  await act(() => {
    viewport.devicePixelRatio = 2;
    armed.forEach((media) => media.dispatchEvent(new Event("change")));
  });
  expect(usesSheet(screen.container)).toBe(false);
  expect(queries).toEqual([
    "(resolution: 1dppx)",
    "(resolution: 1dppx)",
    "(resolution: 2dppx)",
    "(resolution: 2dppx)",
  ]);
});
