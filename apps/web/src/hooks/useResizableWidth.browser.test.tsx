import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../test/render";
import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "./useResizableWidth";

function Panel({
  edge = "left",
  maxWidth = 800,
  storageKey = "test-panel-width",
  autoWidth,
}: {
  edge?: "left" | "right";
  maxWidth?: number;
  storageKey?: string;
  autoWidth?: number;
}) {
  const { width, handlers } = useResizableWidth({
    storageKey,
    defaultWidth: 400,
    minWidth: 200,
    maxWidth,
    edge,
    autoWidth,
  });
  return (
    <aside data-testid="host">
      <output>{width}</output>
      <div data-testid="handle" {...handlers} />
    </aside>
  );
}

const shownWidthIn = (container: HTMLElement) =>
  Number(container.querySelector("output")!.textContent);
const bodyStyle = () => document.body.style;

async function mountPanel(element: ReactElement = <Panel />) {
  await using stack = new AsyncDisposableStack();
  localStorage.clear();
  stack.defer(() => localStorage.clear());
  const state = { captured: false, frame: undefined as FrameRequestCallback | undefined };
  stack.use(
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      state.frame = callback;
      return 42;
    }),
  );
  const cancelFrame = stack.use(
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined),
  );
  const setItem = stack.use(vi.spyOn(Storage.prototype, "setItem"));
  const screen = stack.use(await render(element));

  const host = () => screen.container.querySelector<HTMLElement>("[data-testid=host]")!;
  const handle = () => {
    const handleElement = screen.container.querySelector<HTMLElement>("[data-testid=handle]")!;
    // Synthetic pointers have no active pointer for the browser to capture.
    handleElement.setPointerCapture = () => {
      state.captured = true;
    };
    handleElement.hasPointerCapture = () => state.captured;
    handleElement.releasePointerCapture = () => {
      state.captured = false;
    };
    return handleElement;
  };
  const panel = {
    screen,
    cancelFrame,
    setItem,
    host,
    handle,
    captured: () => state.captured,
    shownWidth: () => shownWidthIn(screen.container),
    liveWidth: () => host().style.getPropertyValue(RESIZABLE_WIDTH_PROPERTY),
    runFrame: () => state.frame?.(0),
    rerender: (next: ReactElement) => screen.rerender(next),
    pointer(
      type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture",
      clientX = 100,
    ) {
      handle().dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 1,
          clientX,
        }),
      );
    },
  };
  const disposal = stack.move();
  return Object.assign(panel, { [Symbol.asyncDispose]: () => disposal.disposeAsync() });
}

describe("panel resize cleanup", () => {
  it.each(["unmount", "lost capture", "blur", "cancel"])(
    "clears the cursor and pending resize after %s",
    async (reason) => {
      await using panel = await mountPanel();
      await act(() => {
        panel.pointer("pointerdown");
        panel.pointer("pointermove", 50);
      });
      const resizedHost = panel.host();
      await act(() => panel.runFrame());
      expect(panel.liveWidth()).toBe("450px");
      expect(resizedHost.style.getPropertyValue("transition-property")).toBe("none");
      expect(panel.shownWidth()).toBe(400);
      await act(() => panel.pointer("pointermove", 25));
      expect(bodyStyle().cursor).toBe("col-resize");
      expect(bodyStyle().userSelect).toBe("none");
      if (reason === "unmount") await panel.screen.unmount();
      else {
        await act(() => {
          if (reason === "lost capture") panel.pointer("lostpointercapture");
          if (reason === "blur") window.dispatchEvent(new Event("blur"));
          if (reason === "cancel") panel.pointer("pointercancel");
        });
      }
      expect(bodyStyle().cursor).toBe("");
      expect(bodyStyle().userSelect).toBe("");
      expect(panel.captured()).toBe(false);
      expect(resizedHost.style.getPropertyValue("transition-property")).toBe("");
      expect(panel.cancelFrame).toHaveBeenCalledWith(42);
      if (reason === "unmount") {
        expect(panel.setItem).not.toHaveBeenCalled();
      } else {
        expect(panel.shownWidth()).toBe(475);
        expect(panel.setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
      }
    },
  );

  it.each(["left", "right"] as const)(
    "uses the release position for a fast %s-edge drag",
    async (edge) => {
      await using panel = await mountPanel();
      await panel.rerender(<Panel edge={edge} />);
      await act(() => {
        panel.pointer("pointerdown");
        panel.pointer("pointermove", edge === "left" ? 50 : 150);
        panel.pointer("pointerup", edge === "left" ? 25 : 175);
      });
      expect(panel.shownWidth()).toBe(475);
      expect(panel.setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
      expect(panel.cancelFrame).toHaveBeenCalledWith(42);
    },
  );

  it.each([
    [800, 450],
    [450, 800],
  ])("uses updated bounds during a drag from max %s to %s", async (initialMax, nextMax) => {
    await using panel = await mountPanel();
    await panel.rerender(<Panel maxWidth={initialMax} />);
    await act(() => {
      panel.pointer("pointerdown");
      panel.pointer("pointermove", -200);
    });
    await act(() => panel.runFrame());
    expect(panel.liveWidth()).toBe(`${Math.min(700, initialMax)}px`);
    await panel.rerender(<Panel maxWidth={nextMax} />);
    await act(() => panel.pointer("pointermove", -250));
    await act(() => panel.runFrame());
    expect(panel.liveWidth()).toBe(`${Math.min(750, nextMax)}px`);
    await act(() => panel.pointer("pointerup", -300));
    expect(panel.shownWidth()).toBe(nextMax);
    expect(panel.setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", String(nextMax));
  });

  it("handles release before any move event", async () => {
    await using panel = await mountPanel();
    await act(() => {
      panel.pointer("pointerdown");
      panel.pointer("pointerup", 25);
    });
    expect(panel.shownWidth()).toBe(475);
    expect(panel.setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
  });

  it("clamps the release position to the panel bounds", async () => {
    await using panel = await mountPanel();
    await act(() => {
      panel.pointer("pointerdown");
      panel.pointer("pointerup", -1000);
    });
    expect(panel.shownWidth()).toBe(800);
    expect(panel.setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "800");
  });

  it("saves the final width when release is followed by lost capture", async () => {
    await using panel = await mountPanel();
    await act(() => {
      panel.pointer("pointerdown");
      panel.pointer("pointermove", 50);
      panel.pointer("pointerup", 50);
      panel.pointer("lostpointercapture", 50);
    });
    expect(panel.shownWidth()).toBe(450);
    expect(panel.setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "450");
    expect(bodyStyle().cursor).toBe("");
    expect(panel.captured()).toBe(false);
  });
});

describe("panel width storage changes", () => {
  it("restores separate thread widths without remounting and retains them after reload", async () => {
    await using panel = await mountPanel();
    await act(() => {
      panel.pointer("pointerdown");
      panel.pointer("pointermove", 50);
      panel.pointer("pointerup", 50);
    });
    expect(panel.shownWidth()).toBe(450);
    await panel.rerender(<Panel storageKey="thread-b" />);
    expect(panel.shownWidth()).toBe(400);
    await act(() => {
      panel.pointer("pointerdown");
      panel.pointer("pointermove", -100);
      panel.pointer("pointerup", -100);
    });
    expect(panel.shownWidth()).toBe(600);
    await panel.rerender(<Panel />);
    expect(panel.shownWidth()).toBe(450);
    await panel.screen.unmount();
    await using reloaded = await render(<Panel storageKey="thread-b" />);
    expect(shownWidthIn(reloaded.container)).toBe(600);
  });
});

describe("panel auto width", () => {
  it("leaves panels without an auto width on the default", async () => {
    await using panel = await mountPanel();
    expect(panel.shownWidth()).toBe(400);
  });

  it("follows the auto width until the user drags, then keeps the dragged width", async () => {
    await using panel = await mountPanel();
    await panel.rerender(<Panel autoWidth={500} />);
    expect(panel.shownWidth()).toBe(500);
    await panel.rerender(<Panel autoWidth={520} />);
    expect(panel.shownWidth()).toBe(520);
    await panel.rerender(<Panel autoWidth={900} />);
    expect(panel.shownWidth()).toBe(800);
    expect(panel.setItem).not.toHaveBeenCalled();

    await panel.rerender(<Panel autoWidth={520} />);
    await act(() => {
      panel.pointer("pointerdown");
      panel.pointer("pointermove", 50);
      panel.pointer("pointerup", 50);
    });
    expect(panel.shownWidth()).toBe(570);
    expect(panel.setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "570");
    await panel.rerender(<Panel autoWidth={600} />);
    expect(panel.shownWidth()).toBe(570);
  });

  it("keeps following the auto width after a click on the handle without a drag", async () => {
    await using panel = await mountPanel();
    await panel.rerender(<Panel autoWidth={500} />);
    await act(() => {
      panel.pointer("pointerdown");
      panel.pointer("pointerup");
    });
    expect(panel.setItem).not.toHaveBeenCalled();
    expect(panel.shownWidth()).toBe(500);

    await panel.rerender(<Panel autoWidth={620} />);
    expect(panel.shownWidth()).toBe(620);
    expect(panel.setItem).not.toHaveBeenCalled();
  });

  it("uses a stored width over the auto width and the auto width where nothing is stored", async () => {
    await using panel = await mountPanel();
    localStorage.setItem("thread-stored", "450");
    await panel.rerender(<Panel storageKey="thread-stored" autoWidth={500} />);
    expect(panel.shownWidth()).toBe(450);
    await panel.rerender(<Panel storageKey="thread-empty" autoWidth={500} />);
    expect(panel.shownWidth()).toBe(500);
    await panel.rerender(<Panel storageKey="thread-stored" autoWidth={500} />);
    expect(panel.shownWidth()).toBe(450);
  });

  it("clears the stored width on double-click and returns to the auto width", async () => {
    await using panel = await mountPanel();
    localStorage.setItem("test-panel-width", "450");
    await panel.rerender(<Panel storageKey="other" autoWidth={500} />);
    await panel.rerender(<Panel autoWidth={500} />);
    expect(panel.shownWidth()).toBe(450);

    await act(() => panel.handle().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(localStorage.getItem("test-panel-width")).toBeNull();
    expect(panel.shownWidth()).toBe(500);
    await panel.rerender(<Panel autoWidth={620} />);
    expect(panel.shownWidth()).toBe(620);
  });
});
