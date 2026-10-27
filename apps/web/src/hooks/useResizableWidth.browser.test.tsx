import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "./useResizableWidth";

let root: Root;
let container: HTMLDivElement;
let captured = false;
let frame: FrameRequestCallback | undefined;
const cancelAnimationFrame = vi.fn();
let setItem: ReturnType<typeof vi.spyOn<Storage, "setItem">>;

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

const host = () => container.querySelector<HTMLElement>("[data-testid=host]")!;
const shownWidth = () => Number(container.querySelector("output")!.textContent);
const liveWidth = () => host().style.getPropertyValue(RESIZABLE_WIDTH_PROPERTY);
const bodyStyle = () => document.body.style;

function handle() {
  const element = container.querySelector<HTMLElement>("[data-testid=handle]")!;
  // Synthetic pointers have no active pointer for the browser to capture.
  element.setPointerCapture = () => {
    captured = true;
  };
  element.hasPointerCapture = () => captured;
  element.releasePointerCapture = () => {
    captured = false;
  };
  return element;
}

function pointer(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture",
  clientX = 100,
) {
  handle().dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX }),
  );
}

async function render(element = <Panel />) {
  await act(() => root.render(element));
}

async function mountFresh(element = <Panel />) {
  root = createRoot(container);
  await render(element);
}

beforeEach(async () => {
  localStorage.clear();
  captured = false;
  frame = undefined;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 42;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(cancelAnimationFrame);
  setItem = vi.spyOn(Storage.prototype, "setItem");
  container = document.createElement("div");
  document.body.append(container);
  await mountFresh();
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  cancelAnimationFrame.mockClear();
});

describe("panel resize cleanup", () => {
  it.each(["unmount", "lost capture", "blur", "cancel"])(
    "clears the cursor and pending resize after %s",
    async (reason) => {
      await act(() => {
        pointer("pointerdown");
        pointer("pointermove", 50);
      });
      const resizedHost = host();
      await act(() => frame?.(0));
      expect(liveWidth()).toBe("450px");
      expect(resizedHost.style.getPropertyValue("transition-property")).toBe("none");
      expect(shownWidth()).toBe(400);
      await act(() => pointer("pointermove", 25));
      expect(bodyStyle().cursor).toBe("col-resize");
      expect(bodyStyle().userSelect).toBe("none");
      await act(() => {
        if (reason === "unmount") root.unmount();
        if (reason === "lost capture") pointer("lostpointercapture");
        if (reason === "blur") window.dispatchEvent(new Event("blur"));
        if (reason === "cancel") pointer("pointercancel");
      });
      expect(bodyStyle().cursor).toBe("");
      expect(bodyStyle().userSelect).toBe("");
      expect(captured).toBe(false);
      expect(resizedHost.style.getPropertyValue("transition-property")).toBe("");
      expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
      if (reason === "unmount") {
        expect(setItem).not.toHaveBeenCalled();
        await mountFresh();
      } else {
        expect(shownWidth()).toBe(475);
        expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
      }
    },
  );

  it.each(["left", "right"] as const)(
    "uses the release position for a fast %s-edge drag",
    async (edge) => {
      await render(<Panel edge={edge} />);
      await act(() => {
        pointer("pointerdown");
        pointer("pointermove", edge === "left" ? 50 : 150);
        pointer("pointerup", edge === "left" ? 25 : 175);
      });
      expect(shownWidth()).toBe(475);
      expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
      expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    },
  );

  it.each([
    [800, 450],
    [450, 800],
  ])("uses updated bounds during a drag from max %s to %s", async (initialMax, nextMax) => {
    await render(<Panel maxWidth={initialMax} />);
    await act(() => {
      pointer("pointerdown");
      pointer("pointermove", -200);
    });
    await act(() => frame?.(0));
    expect(liveWidth()).toBe(`${Math.min(700, initialMax)}px`);
    await render(<Panel maxWidth={nextMax} />);
    await act(() => pointer("pointermove", -250));
    await act(() => frame?.(0));
    expect(liveWidth()).toBe(`${Math.min(750, nextMax)}px`);
    await act(() => pointer("pointerup", -300));
    expect(shownWidth()).toBe(nextMax);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", String(nextMax));
  });

  it("handles release before any move event", async () => {
    await act(() => {
      pointer("pointerdown");
      pointer("pointerup", 25);
    });
    expect(shownWidth()).toBe(475);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
  });

  it("clamps the release position to the panel bounds", async () => {
    await act(() => {
      pointer("pointerdown");
      pointer("pointerup", -1000);
    });
    expect(shownWidth()).toBe(800);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "800");
  });

  it("saves the final width when release is followed by lost capture", async () => {
    await act(() => {
      pointer("pointerdown");
      pointer("pointermove", 50);
      pointer("pointerup", 50);
      pointer("lostpointercapture", 50);
    });
    expect(shownWidth()).toBe(450);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "450");
    expect(bodyStyle().cursor).toBe("");
    expect(captured).toBe(false);
  });
});

describe("panel width storage changes", () => {
  it("restores separate thread widths without remounting and retains them after reload", async () => {
    await act(() => {
      pointer("pointerdown");
      pointer("pointermove", 50);
      pointer("pointerup", 50);
    });
    expect(shownWidth()).toBe(450);
    await render(<Panel storageKey="thread-b" />);
    expect(shownWidth()).toBe(400);
    await act(() => {
      pointer("pointerdown");
      pointer("pointermove", -100);
      pointer("pointerup", -100);
    });
    expect(shownWidth()).toBe(600);
    await render(<Panel />);
    expect(shownWidth()).toBe(450);
    await act(() => root.unmount());
    await mountFresh(<Panel storageKey="thread-b" />);
    expect(shownWidth()).toBe(600);
  });
});

describe("panel auto width", () => {
  it("leaves panels without an auto width on the default", () => {
    expect(shownWidth()).toBe(400);
  });

  it("follows the auto width until the user drags, then keeps the dragged width", async () => {
    await render(<Panel autoWidth={500} />);
    expect(shownWidth()).toBe(500);
    await render(<Panel autoWidth={520} />);
    expect(shownWidth()).toBe(520);
    await render(<Panel autoWidth={900} />);
    expect(shownWidth()).toBe(800);
    expect(setItem).not.toHaveBeenCalled();

    await render(<Panel autoWidth={520} />);
    await act(() => {
      pointer("pointerdown");
      pointer("pointermove", 50);
      pointer("pointerup", 50);
    });
    expect(shownWidth()).toBe(570);
    expect(setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "570");
    await render(<Panel autoWidth={600} />);
    expect(shownWidth()).toBe(570);
  });

  it("keeps following the auto width after a click on the handle without a drag", async () => {
    await render(<Panel autoWidth={500} />);
    await act(() => {
      pointer("pointerdown");
      pointer("pointerup");
    });
    expect(setItem).not.toHaveBeenCalled();
    expect(shownWidth()).toBe(500);

    await render(<Panel autoWidth={620} />);
    expect(shownWidth()).toBe(620);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("uses a stored width over the auto width and the auto width where nothing is stored", async () => {
    localStorage.setItem("thread-stored", "450");
    await render(<Panel storageKey="thread-stored" autoWidth={500} />);
    expect(shownWidth()).toBe(450);
    await render(<Panel storageKey="thread-empty" autoWidth={500} />);
    expect(shownWidth()).toBe(500);
    await render(<Panel storageKey="thread-stored" autoWidth={500} />);
    expect(shownWidth()).toBe(450);
  });

  it("clears the stored width on double-click and returns to the auto width", async () => {
    localStorage.setItem("test-panel-width", "450");
    await render(<Panel storageKey="other" autoWidth={500} />);
    await render(<Panel autoWidth={500} />);
    expect(shownWidth()).toBe(450);

    await act(() => handle().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(localStorage.getItem("test-panel-width")).toBeNull();
    expect(shownWidth()).toBe(500);
    await render(<Panel autoWidth={620} />);
    expect(shownWidth()).toBe(620);
  });
});
