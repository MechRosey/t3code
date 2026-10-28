import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  compileResolvedKeybindingsConfig,
  DEFAULT_RESOLVED_KEYBINDINGS,
} from "@t3tools/shared/keybindings";

import { act, fakeTimers, render, stubGlobal, type Screen } from "../../test/render";
import { RightPanelTabs } from "./RightPanelTabs";

vi.mock("~/hooks/useTheme", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("~/browser/browserDefaults", () => ({ useBrowserDefaults: () => ({ profiles: [] }) }));

const noop = () => undefined;

class StubResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function stubNoAnimations(): Disposable {
  const original = Object.getOwnPropertyDescriptor(Element.prototype, "getAnimations");
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  return {
    [Symbol.dispose]() {
      if (original) Object.defineProperty(Element.prototype, "getAnimations", original);
      else Reflect.deleteProperty(Element.prototype, "getAnimations");
    },
  };
}

function stubPanelEnvironment(platform = "MacIntel"): Disposable {
  const timers = fakeTimers();
  const resizeObserver = stubGlobal("ResizeObserver", StubResizeObserver);
  const animations = stubNoAnimations();
  const spy = vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  return {
    [Symbol.dispose]() {
      spy.mockRestore();
      animations[Symbol.dispose]();
      resizeObserver[Symbol.dispose]();
      timers[Symbol.dispose]();
    },
  };
}

const panel = (overrides: Partial<ComponentProps<typeof RightPanelTabs>> = {}) => (
  <RightPanelTabs
    mode="inline"
    open
    keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
    getShortcutContext={() => ({
      terminalFocus: false,
      terminalOpen: false,
      previewFocus: false,
      previewOpen: false,
      isWeb: true,
      isDesktop: false,
    })}
    surfaces={[]}
    environmentId={null}
    activeSurfaceId={null}
    pendingSurfaceIds={new Set()}
    previewSessions={{}}
    desktopByTabId={{}}
    terminalLabelsById={new Map()}
    onActivate={noop}
    onCloseSurface={noop}
    onCloseOtherSurfaces={noop}
    onCloseSurfacesToRight={noop}
    onCloseAllSurfaces={noop}
    onCopyFilePath={noop}
    onAddBrowser={noop}
    onAddBrowserInProfile={noop}
    onAddTerminal={noop}
    onAddDiff={noop}
    onAddFiles={noop}
    onAddPullRequest={noop}
    onAddPullRequests={noop}
    onAddBoard={noop}
    onAddDevice={noop}
    browserAvailable={false}
    terminalAvailable={false}
    diffAvailable={false}
    filesAvailable
    pullRequestAvailable={false}
    pullRequestsAvailable={false}
    boardAvailable={false}
    deviceAvailable={false}
    {...overrides}
  >
    content
  </RightPanelTabs>
);

async function settle() {
  await act(() => vi.advanceTimersByTimeAsync(0));
  await act(() => vi.advanceTimersToNextFrame());
}

async function renderPanel(overrides: Partial<ComponentProps<typeof RightPanelTabs>> = {}) {
  await using stack = new AsyncDisposableStack();
  const screen = stack.use(await render(panel(overrides)));
  await settle();
  stack.move();
  return screen;
}

async function rerenderPanel(
  screen: Screen,
  overrides: Partial<ComponentProps<typeof RightPanelTabs>> = {},
) {
  await screen.rerender(panel(overrides));
  await settle();
}

async function press(key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  await act(() => (document.activeElement ?? document.body).dispatchEvent(event));
  await settle();
  return event;
}

describe("right panel new-tab shortcut", () => {
  it.each(["MacIntel", "Win32", "Linux x86_64"])(
    "opens the menu on %s and chooses a tab",
    async (platform) => {
      using _environment = stubPanelEnvironment(platform);
      const addFiles = vi.fn();
      await using _screen = await renderPanel({ onAddFiles: addFiles });
      const event = await press(
        "t",
        platform === "MacIntel" ? { metaKey: true } : { ctrlKey: true },
      );
      expect(event.defaultPrevented).toBe(true);
      expect(document.querySelector('[role="menu"]')?.textContent).toContain(
        "Linked pull requests",
      );
      expect(document.activeElement?.closest('[role="menu"]')).not.toBeNull();
      expect(
        (
          await press("t", {
            metaKey: platform === "MacIntel",
            ctrlKey: platform !== "MacIntel",
            repeat: true,
          })
        ).defaultPrevented,
      ).toBe(true);
      await press("f");
      expect(addFiles).toHaveBeenCalledOnce();
      expect(document.querySelector('[role="menu"]:not([data-closed])')).toBeNull();
    },
  );

  it("leaves the shortcut alone while the mounted panel is closed", async () => {
    using _environment = stubPanelEnvironment();
    await using _screen = await renderPanel({ open: false });
    expect((await press("t", { metaKey: true })).defaultPrevented).toBe(false);
    expect(document.querySelector('[role="menu"]:not([data-closed])')).toBeNull();
  });

  it.each(["Win32", "Linux x86_64"])(
    "leaves Ctrl+T for the focused terminal on %s",
    async (platform) => {
      using _environment = stubPanelEnvironment(platform);
      await using screen = await renderPanel({
        getShortcutContext: () => ({
          terminalFocus: true,
          terminalOpen: true,
          previewFocus: false,
          previewOpen: false,
          isWeb: true,
          isDesktop: false,
        }),
      });
      const terminal = document.createElement("textarea");
      const onKeyDown = vi.fn();
      terminal.addEventListener("keydown", onKeyDown);
      screen.container.append(terminal);
      await act(() => terminal.focus());
      const event = await press("t", { ctrlKey: true });
      expect(event.defaultPrevented).toBe(false);
      expect(onKeyDown).toHaveBeenCalledWith(event);
      expect(document.querySelector('[role="menu"]:not([data-closed])')).toBeNull();
    },
  );

  it("uses a custom binding from a text field and closes on Escape", async () => {
    using _environment = stubPanelEnvironment();
    const input = document.createElement("input");
    await using screen = await renderPanel({
      keybindings: compileResolvedKeybindingsConfig([{ key: "mod+y", command: "rightPanel.new" }]),
    });
    document.body.append(input);
    input.focus();
    expect((await press("t", { metaKey: true })).defaultPrevented).toBe(false);
    await press("y", { metaKey: true });
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    await press("Escape");
    expect(document.querySelector('[role="menu"]:not([data-closed])')).toBeNull();
    // The menu hands focus back to its trigger once its close finishes, a few frames later.
    // Timers are fake here, so advance them instead of polling in real time.
    const trigger = screen.container.querySelector('[aria-label="Add panel surface"]');
    for (let frame = 0; frame < 10 && document.activeElement !== trigger; frame++) {
      await act(() => vi.advanceTimersToNextFrame());
    }
    expect(document.activeElement).toBe(trigger);
    input.remove();
  });

  it("does not open over another popup or during text composition", async () => {
    using _environment = stubPanelEnvironment();
    await using screen = await renderPanel();
    expect((await press("t", { metaKey: true, isComposing: true })).defaultPrevented).toBe(false);
    const dialog = document.createElement("div");
    dialog.dataset.slot = "dialog-popup";
    dialog.dataset.open = "";
    screen.container.append(dialog);
    expect((await press("t", { metaKey: true })).defaultPrevented).toBe(false);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("supports arrow keys with an existing tab in sheet mode and clears the menu on close", async () => {
    const panelProps = {
      mode: "sheet" as const,
      surfaces: [{ id: "files" as const, kind: "files" as const }],
    };
    using _environment = stubPanelEnvironment();
    const addFiles = vi.fn();
    await using screen = await renderPanel({ ...panelProps, onAddFiles: addFiles });
    await press("t", { metaKey: true });
    await press("ArrowDown");
    await press("ArrowDown");
    await press("ArrowDown");
    expect(document.activeElement?.textContent).toContain("Files");
    await press("Enter");
    expect(addFiles).toHaveBeenCalledOnce();
    await press("t", { metaKey: true });
    await rerenderPanel(screen, { ...panelProps, onAddFiles: addFiles, open: false });
    expect(document.querySelector('[role="menu"]:not([data-closed])')).toBeNull();
    await rerenderPanel(screen, { ...panelProps, onAddFiles: addFiles });
    expect(document.querySelector('[role="menu"]:not([data-closed])')).toBeNull();
  });
});
