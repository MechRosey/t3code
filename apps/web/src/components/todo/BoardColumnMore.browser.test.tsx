import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BoardColumnMore } from "./BoardColumnMore";
import { BOARD_COLUMN_INITIAL_CARDS, BOARD_COLUMN_REVEAL_STEP } from "./boardColumnWindow.logic";

const DONE = "done";
const DONE_LABEL = "Done";
const HIDDEN_TAIL = 10;

let observers: TestIntersectionObserver[] = [];

class TestIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {
    observers.push(this);
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  report(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  container.remove();
  observers = [];
  vi.unstubAllGlobals();
});

async function renderMore(props: {
  readonly mountedCount: number;
  readonly hiddenCount: number;
  readonly onReveal: (status: string, mountedCount: number) => void;
}) {
  await act(() => root.render(<BoardColumnMore status={DONE} label={DONE_LABEL} {...props} />));
}

const moreButton = () => container.querySelector<HTMLButtonElement>("button")!;

describe("BoardColumnMore", () => {
  it("BoardColumnMore_ScrolledIntoView_RevealsTheNextStep", async () => {
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    const onReveal = vi.fn();
    await renderMore({
      mountedCount: BOARD_COLUMN_INITIAL_CARDS,
      hiddenCount: BOARD_COLUMN_REVEAL_STEP + HIDDEN_TAIL,
      onReveal,
    });

    expect(moreButton().textContent).toBe(`Show ${BOARD_COLUMN_REVEAL_STEP} more`);
    const first = observers.at(-1)!;
    expect(first.observe).toHaveBeenCalledTimes(1);
    expect(first.observe).toHaveBeenCalledWith(moreButton());

    await act(() => first.report(false));
    expect(onReveal).not.toHaveBeenCalled();

    await act(() => first.report(true));
    expect(onReveal).toHaveBeenCalledWith(DONE, BOARD_COLUMN_INITIAL_CARDS);

    const grown = BOARD_COLUMN_INITIAL_CARDS + BOARD_COLUMN_REVEAL_STEP;
    await renderMore({ mountedCount: grown, hiddenCount: HIDDEN_TAIL, onReveal });
    expect(first.disconnect).toHaveBeenCalled();
    expect(moreButton().textContent).toBe(`Show ${HIDDEN_TAIL} more`);
    const second = observers.at(-1)!;
    expect(second).not.toBe(first);

    await act(() => second.report(true));
    expect(onReveal).toHaveBeenLastCalledWith(DONE, grown);

    await act(() => root.unmount());
    expect(observers.at(-1)!.disconnect).toHaveBeenCalled();
  });

  it("BoardColumnMore_WithoutIntersectionObserver_StillRevealsOnClick", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const onReveal = vi.fn();
    await renderMore({
      mountedCount: BOARD_COLUMN_INITIAL_CARDS,
      hiddenCount: HIDDEN_TAIL,
      onReveal,
    });

    await act(() => moreButton().click());

    expect(onReveal).toHaveBeenCalledWith(DONE, BOARD_COLUMN_INITIAL_CARDS);
    await act(() => root.unmount());
  });
});
