"use client";

import { useCurrentRoute } from "@/context/CurrentRouteContext";
import { useAppPathname } from "@/hooks/useAppSearchParams";
import {
  cleanDashboardHref,
  shouldShowDashboardNavOverlay,
} from "@/lib/navigation/dashboard-nav-transition";

/** True while the layout GM overlay covers the workspace (main + right rail). */
export function useDashboardWorkspaceOverlayVisible(): boolean {
  const ctx = useCurrentRoute();
  const pathname = useAppPathname();
  const pending = ctx?.pendingNavHref ?? null;
  if (!ctx?.isNavigating || pending == null) return false;
  return shouldShowDashboardNavOverlay(cleanDashboardHref(pathname), pending);
}
