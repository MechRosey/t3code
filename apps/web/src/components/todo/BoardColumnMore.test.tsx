import { act } from "react";
import { create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { BoardColumnMore } from "./BoardColumnMore";
import { BOARD_COLUMN_INITIAL_CARDS, BOARD_COLUMN_REVEAL_STEP } from "./boardColumnWindow.logic";

const DONE = "done";
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

function renderMore(props: {
  readonly mountedCount: number;
  readonly hiddenCount: number;
  readonly onReveal: (status: string, mountedCount: number) => void;
}): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(<BoardColumnMore status={DONE} {...props} />, {
      createNodeMock: () => ({}),
    });
  });
  return renderer!;
}

const moreButton = (renderer: ReactTestRenderer): ReactTestInstance =>
  renderer.root.find((node) => node.type === "button");

describe("BoardColumnMore", () => {
  afterEach(() => {
    observers = [];
    vi.unstubAllGlobals();
  });

  it("BoardColumnMore_ScrolledIntoView_RevealsTheNextStep", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    const onReveal = vi.fn();
    const renderer = renderMore({
      mountedCount: BOARD_COLUMN_INITIAL_CARDS,
      hiddenCount: BOARD_COLUMN_REVEAL_STEP + HIDDEN_TAIL,
      onReveal,
    });
    try {
      expect(moreButton(renderer).props.children).toBe(`Show ${BOARD_COLUMN_REVEAL_STEP} more`);
      const first = observers.at(-1)!;
      expect(first.observe).toHaveBeenCalledTimes(1);

      act(() => first.report(false));
      expect(onReveal).not.toHaveBeenCalled();

      act(() => first.report(true));
      expect(onReveal).toHaveBeenCalledWith(DONE, BOARD_COLUMN_INITIAL_CARDS);

      const grown = BOARD_COLUMN_INITIAL_CARDS + BOARD_COLUMN_REVEAL_STEP;
      act(() =>
        renderer.update(
          <BoardColumnMore
            status={DONE}
            mountedCount={grown}
            hiddenCount={HIDDEN_TAIL}
            onReveal={onReveal}
          />,
        ),
      );
      expect(first.disconnect).toHaveBeenCalled();
      expect(moreButton(renderer).props.children).toBe(`Show ${HIDDEN_TAIL} more`);
      const second = observers.at(-1)!;
      expect(second).not.toBe(first);

      act(() => second.report(true));
      expect(onReveal).toHaveBeenLastCalledWith(DONE, grown);
    } finally {
      act(() => renderer.unmount());
    }
    expect(observers.at(-1)!.disconnect).toHaveBeenCalled();
  });

  it("BoardColumnMore_WithoutIntersectionObserver_StillRevealsOnClick", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("IntersectionObserver", undefined);
    const onReveal = vi.fn();
    const renderer = renderMore({
      mountedCount: BOARD_COLUMN_INITIAL_CARDS,
      hiddenCount: HIDDEN_TAIL,
      onReveal,
    });
    try {
      act(() => moreButton(renderer).props.onClick());

      expect(onReveal).toHaveBeenCalledWith(DONE, BOARD_COLUMN_INITIAL_CARDS);
    } finally {
      act(() => renderer.unmount());
    }
  });
});
