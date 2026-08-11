"use client";

import { useSyncExternalStore } from "react";
import {
  readBrowserPathname,
  subscribeBrowserPathname,
} from "@/lib/navigation/history-location-sync";

/**
 * Live pathname from `window.location` — catches soft navigations when
 * `usePathname()` lags (common on heavy ticket detail after idle).
 */
export function useBrowserPathname(): string {
  return useSyncExternalStore(
    subscribeBrowserPathname,
    readBrowserPathname,
    () => ""
  );
}
