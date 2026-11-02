import { describe, expect, it, vi } from "vite-plus/test";

import { act, render, stubGlobal } from "../../../test/render";
import { BoardColumnMore } from "./BoardColumnMore";
import { BOARD_COLUMN_INITIAL_CARDS, BOARD_COLUMN_REVEAL_STEP } from "./boardColumnWindow.logic";

const DONE = "done";
const DONE_LABEL = "Done";
const HIDDEN_TAIL = 10;

function stubIntersectionObserver() {
  const observers: Array<TestIntersectionObserver> = [];

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

  const stub = stubGlobal("IntersectionObserver", TestIntersectionObserver);
  return { observers, [Symbol.dispose]: () => stub[Symbol.dispose]() };
}

type MoreProps = {
  readonly mountedCount: number;
  readonly hiddenCount: number;
  readonly onReveal: (status: string, mountedCount: number) => void;
};

const more = (props: MoreProps) => <BoardColumnMore status={DONE} label={DONE_LABEL} {...props} />;

const moreButton = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>("button")!;

describe("BoardColumnMore", () => {
  it("BoardColumnMore_ScrolledIntoView_RevealsTheNextStep", async () => {
    using stub = stubIntersectionObserver();
    const { observers } = stub;
    const onReveal = vi.fn();
    await using screen = await render(
      more({
        mountedCount: BOARD_COLUMN_INITIAL_CARDS,
        hiddenCount: BOARD_COLUMN_REVEAL_STEP + HIDDEN_TAIL,
        onReveal,
      }),
    );

    expect(moreButton(screen.container).textContent).toBe(`Show ${BOARD_COLUMN_REVEAL_STEP} more`);
    const first = observers.at(-1)!;
    expect(first.observe).toHaveBeenCalledTimes(1);
    expect(first.observe).toHaveBeenCalledWith(moreButton(screen.container));

    await act(() => first.report(false));
    expect(onReveal).not.toHaveBeenCalled();

    await act(() => first.report(true));
    expect(onReveal).toHaveBeenCalledWith(DONE, BOARD_COLUMN_INITIAL_CARDS);

    const grown = BOARD_COLUMN_INITIAL_CARDS + BOARD_COLUMN_REVEAL_STEP;
    await screen.rerender(more({ mountedCount: grown, hiddenCount: HIDDEN_TAIL, onReveal }));
    expect(first.disconnect).toHaveBeenCalled();
    expect(moreButton(screen.container).textContent).toBe(`Show ${HIDDEN_TAIL} more`);
    const second = observers.at(-1)!;
    expect(second).not.toBe(first);

    await act(() => second.report(true));
    expect(onReveal).toHaveBeenLastCalledWith(DONE, grown);

    await screen.unmount();
    expect(observers.at(-1)!.disconnect).toHaveBeenCalled();
  });

  it("BoardColumnMore_WithoutIntersectionObserver_StillRevealsOnClick", async () => {
    using _observer = stubGlobal("IntersectionObserver", undefined);
    const onReveal = vi.fn();
    await using screen = await render(
      more({
        mountedCount: BOARD_COLUMN_INITIAL_CARDS,
        hiddenCount: HIDDEN_TAIL,
        onReveal,
      }),
    );

    await act(() => moreButton(screen.container).click());

    expect(onReveal).toHaveBeenCalledWith(DONE, BOARD_COLUMN_INITIAL_CARDS);
  });
});
