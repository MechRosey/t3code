import { useSyncExternalStore } from "react";

import { shouldUseRightPanelSheetLayout } from "../rightPanelLayout";
import { isElectron } from "~/env";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
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
