export function cleanDashboardHref(href: string): string {
  return href.split("?")[0].split("#")[0];
}

/** Top-level dashboard module prefix, e.g. `/dashboard/riders`. */
export function getDashboardModuleKey(path: string): string {
  const clean = cleanDashboardHref(path);
  if (clean === "/dashboard") return "/dashboard";
  const match = clean.match(/^(\/dashboard\/[^/]+)/);
  return match ? match[1] : clean;
}

/** True only when the user is already on the module root (not a nested sub-route). */
export function isDashboardNavAlreadyAtTarget(fromPath: string, toHref: string): boolean {
  return cleanDashboardHref(fromPath) === cleanDashboardHref(toHref);
}

export function isCrossModuleNavigation(fromPath: string, toHref: string): boolean {
  return getDashboardModuleKey(fromPath) !== getDashboardModuleKey(toHref);
}

/** Navigation finished when the active URL belongs to the target module. */
export function hasReachedNavTarget(pathname: string, target: string): boolean {
  const path = cleanDashboardHref(pathname);
  const tgt = cleanDashboardHref(target);
  if (path === tgt) return true;
  if (tgt === "/dashboard") return path === "/dashboard";
  if (path.startsWith(`${tgt}/`)) return true;
  return getDashboardModuleKey(path) === getDashboardModuleKey(tgt);
}

/** Whether the layout navigation overlay should run for this in-app route change. */
export function shouldShowDashboardNavOverlay(fromPath: string, toHref: string): boolean {
  const cleanPath = cleanDashboardHref(fromPath);
  const cleanTarget = cleanDashboardHref(toHref);
  if (isDashboardNavAlreadyAtTarget(cleanPath, cleanTarget)) return false;
  // Cross-module jumps always get the global overlay (sidebar must win).
  if (isCrossModuleNavigation(cleanPath, cleanTarget)) return true;
  // Tickets hub + queue share one app shell; let client routes load their own loaders.
  if (
    cleanPath.startsWith("/dashboard/tickets") &&
    cleanTarget.startsWith("/dashboard/tickets")
  ) {
    return false;
  }
  // Orders list uses its own skeleton + cached React Query data within orders.
  if (
    cleanPath.startsWith("/dashboard/orders") &&
    cleanTarget.startsWith("/dashboard/orders")
  ) {
    return false;
  }
  // Rider sub-pages share context + per-page loaders; keep sidebars stable.
  if (
    cleanPath.startsWith("/dashboard/riders") &&
    cleanTarget.startsWith("/dashboard/riders")
  ) {
    return false;
  }
  return true;
}
