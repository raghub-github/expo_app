"use client";

import { usePathname } from "next/navigation";

/**
 * Returns true when the current pathname is under the given dashboard route.
 * Use with React Query's `enabled` so a query runs only when the user is on that page.
 *
 * @example
 * const isOnAnalytics = useIsDashboardRoute("/dashboard/analytics");
 * useQuery({ queryKey: [...], queryFn: fetchAnalytics, enabled: isOnAnalytics });
 */
export function useIsDashboardRoute(routePrefix: string): boolean {
  const pathname = usePathname();
  const clean = pathname?.split("?")[0].split("#")[0] ?? "";
  return routePrefix === clean || clean.startsWith(routePrefix + "/");
}
