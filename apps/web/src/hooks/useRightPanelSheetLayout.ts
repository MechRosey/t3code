import { useSyncExternalStore } from "react";

import { shouldUseRightPanelSheetLayout } from "../rightPanelLayout";
import { isElectron } from "~/env";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", callback);
  if (!isElectron) return () => window.removeEventListener("resize", callback);
  let resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  const onResolutionChange = () => {
    resolution.removeEventListener("change", onResolutionChange);
    resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    resolution.addEventListener("change", onResolutionChange);
    callback();
  };
  resolution.addEventListener("change", onResolutionChange);
  return () => {
    window.removeEventListener("resize", callback);
    resolution.removeEventListener("change", onResolutionChange);
  };
}

function useViewportWidth(): number {
  return useSyncExternalStore(
    subscribe,
    () => window.innerWidth,
    () => 1280,
  );
}

function useDevicePixelRatio(): number {
  return useSyncExternalStore(
    subscribe,
    () => window.devicePixelRatio,
    () => 1,
  );
}

export function useRightPanelSheetLayout(): boolean {
  return shouldUseRightPanelSheetLayout(
    { viewportWidth: useViewportWidth(), devicePixelRatio: useDevicePixelRatio() },
    isElectron,
  );
}
