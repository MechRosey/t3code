import type { DesktopPreviewFavicon, PreviewSessionSnapshot } from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../test/render";

const setAudioMuted = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock(import("~/hooks/useTheme"), async (original) => ({
  ...(await original()),
  useTheme: () => ({ theme: "light", resolvedTheme: "light", themeHalves: null }) as never,
}));
vi.mock(import("~/browser/browserDefaults"), async (original) => ({
  ...(await original()),
  useBrowserDefaults: () => ({ profiles: [] }) as never,
}));
vi.mock(import("./preview/previewBridge"), () => ({
  previewBridge: { setAudioMuted } as never,
}));

import { RightPanelTabs } from "./RightPanelTabs";

// A real 1x1 PNG, so the browser keeps it instead of falling back on a decode error.
const PIXEL_A =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PIXEL_B =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const previewSurface = {
  id: "browser:tab-1" as const,
  kind: "preview" as const,
  resourceId: "tab-1",
};
const secondSurface = {
  id: "browser:tab-2" as const,
  kind: "preview" as const,
  resourceId: "tab-2",
};
const sessions: Readonly<Record<string, PreviewSessionSnapshot>> = {
  "tab-1": {
    threadId: "thread-1",
    tabId: "tab-1",
    navStatus: { _tag: "Success", url: "http://24x.xf.local/", title: "Local site" },
    canGoBack: false,
    canGoForward: false,
    updatedAt: "2026-08-09T00:00:00.000Z",
  },
  "tab-2": {
    threadId: "thread-1",
    tabId: "tab-2",
    navStatus: { _tag: "Success", url: "http://24x.xf.local/admin", title: "Admin" },
    canGoBack: false,
    canGoForward: false,
    updatedAt: "2026-08-09T00:00:00.000Z",
  },
};

const favicon = (dataUrl: string, pageUrl: string): DesktopPreviewFavicon => ({
  dataUrl,
  pageUrl,
  capturedAt: 1,
});

function overlay(
  icon: DesktopPreviewFavicon | null,
  audio?: { audible?: boolean; audioMuted?: boolean },
) {
  return {
    hasWebContents: true,
    canGoBack: false,
    canGoForward: false,
    loading: false,
    zoomFactor: 1,
    pictureInPicture: false,
    colorScheme: "system" as const,
    audioMuted: audio?.audioMuted ?? false,
    audible: audio?.audible ?? false,
    controller: "none" as const,
    favicon: icon,
  };
}

const noop = () => undefined;

function tabsProps(
  overrides: Partial<ComponentProps<typeof RightPanelTabs>> = {},
): ComponentProps<typeof RightPanelTabs> {
  return {
    mode: "inline",
    open: true,
    keybindings: DEFAULT_RESOLVED_KEYBINDINGS,
    getShortcutContext: () => ({
      terminalFocus: false,
      terminalOpen: false,
      previewFocus: false,
      previewOpen: false,
      isWeb: true,
      isDesktop: false,
    }),
    surfaces: [],
    environmentId: null,
    activeSurfaceId: null,
    pendingSurfaceIds: new Set(),
    previewSessions: sessions,
    desktopByTabId: {},
    terminalLabelsById: new Map(),
    onActivate: noop,
    onCloseSurface: noop,
    onCloseOtherSurfaces: noop,
    onCloseSurfacesToRight: noop,
    onCloseAllSurfaces: noop,
    onCopyFilePath: noop,
    onAddBrowser: noop,
    onAddBrowserInProfile: noop,
    onAddTerminal: noop,
    onAddPullRequest: noop,
    onAddPullRequests: noop,
    onAddBoard: noop,
    onAddDiff: noop,
    onAddFiles: noop,
    onAddDevice: noop,
    browserAvailable: true,
    terminalAvailable: false,
    diffAvailable: false,
    filesAvailable: false,
    pullRequestAvailable: false,
    pullRequestsAvailable: false,
    boardAvailable: true,
    deviceAvailable: false,
    children: <div>content</div>,
    ...overrides,
  };
}

const panel = (overrides: Partial<ComponentProps<typeof RightPanelTabs>> = {}) => (
  <RightPanelTabs {...tabsProps(overrides)} />
);

function tabsPanel(
  first: DesktopPreviewFavicon | null,
  second?: DesktopPreviewFavicon,
  audio?: { audible?: boolean; audioMuted?: boolean },
  previewRuntimeTabId: ((tabId: string) => string) | null = (tabId) => `runtime:${tabId}`,
) {
  return panel({
    surfaces: second ? [previewSurface, secondSurface] : [previewSurface],
    activeSurfaceId: previewSurface.id,
    desktopByTabId: {
      "tab-1": overlay(first, audio),
      ...(second ? { "tab-2": overlay(second) } : {}),
    },
    ...(previewRuntimeTabId ? { previewRuntimeTabId } : {}),
  });
}

const imageSources = (container: HTMLElement) =>
  [...container.querySelectorAll("img")].map((image) => image.src);
const button = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll("button")].find((element) => element.ariaLabel === name);

describe("preview tab favicon", () => {
  it("prefers a live capture and never asks a public provider about a private hostname", async () => {
    await using screen = await render(tabsPanel(favicon(PIXEL_A, "http://24x.xf.local/")));
    expect(imageSources(screen.container)).toEqual([PIXEL_A]);

    await screen.rerender(tabsPanel(null));
    expect(imageSources(screen.container)).toEqual([]);
  });

  it("keeps route-specific captures isolated between live tabs on one origin", async () => {
    await using screen = await render(
      tabsPanel(
        favicon(PIXEL_A, "http://24x.xf.local/"),
        favicon(PIXEL_B, "http://24x.xf.local/admin"),
      ),
    );
    expect(imageSources(screen.container)).toEqual([PIXEL_A, PIXEL_B]);
  });

  it("hides a capture while the server session still describes another origin", async () => {
    await using screen = await render(tabsPanel(favicon(PIXEL_A, "https://example.com/")));
    expect(imageSources(screen.container)).not.toContain(PIXEL_A);
  });
});

describe("preview tab audio toggle", () => {
  it.each([
    { audible: false, audioMuted: false },
    { audible: false, audioMuted: true },
  ])("is absent for a silent tab (muted=$audioMuted)", async (audio) => {
    await using screen = await render(tabsPanel(null, undefined, audio));
    expect(button(screen.container, "Mute Local site")).toBeUndefined();
    expect(button(screen.container, "Unmute Local site")).toBeUndefined();
  });

  it.each([
    { audioMuted: false, label: "Mute Local site", nextMuted: true },
    { audioMuted: true, label: "Unmute Local site", nextMuted: false },
  ])("$label addresses the desktop by runtime tab id", async ({ audioMuted, label, nextMuted }) => {
    setAudioMuted.mockClear();
    await using screen = await render(tabsPanel(null, undefined, { audible: true, audioMuted }));
    await act(() => button(screen.container, label)!.click());
    expect(setAudioMuted).toHaveBeenCalledExactlyOnceWith("runtime:tab-1", nextMuted);
  });

  it("hides the toggle when no runtime tab id can be resolved", async () => {
    await using screen = await render(tabsPanel(null, undefined, { audible: true }, null));
    expect(button(screen.container, "Mute Local site")).toBeUndefined();
  });
});

describe("empty-panel launcher", () => {
  it("lists the todo board with its shortcut only while a project is open", async () => {
    await using screen = await render(panel({ browserAvailable: false, boardAvailable: true }));
    expect(screen.container.textContent).toContain("Todo Board");
    expect(screen.container.querySelector('[data-surface-launcher-keys="O"]')).not.toBeNull();

    await screen.rerender(panel({ browserAvailable: false, boardAvailable: false }));
    expect(screen.container.textContent).toContain("Todo Board");
    expect(screen.container.querySelector('[data-surface-launcher-keys=""]')).not.toBeNull();
  });
});

describe("board tab", () => {
  it("is titled Todo Board", async () => {
    await using screen = await render(
      panel({ surfaces: [{ id: "board", kind: "board" }], activeSurfaceId: "board" }),
    );
    expect(screen.container.textContent).toContain("Todo Board");
  });
});
