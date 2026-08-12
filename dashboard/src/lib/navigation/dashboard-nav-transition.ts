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

/** Navigation finished when the active URL matches the target (or a nested child of it). */
export function hasReachedNavTarget(pathname: string, target: string): boolean {
  const path = cleanDashboardHref(pathname);
  const tgt = cleanDashboardHref(target);
  if (path === tgt) return true;
  if (tgt === "/dashboard") return path === "/dashboard";
  // Reached only when we landed on the target or a deeper path under it —
  // not when we're still on a sibling under the same module (e.g. super-admin tabs).
  if (path.startsWith(`${tgt}/`)) return true;
  return false;
}

/**
 * Whether the main-content GM overlay should show during left-sidebar soft-nav.
 * Cross-module jumps show the spinner while RSC/data catches up; same-module
 * routes (tickets hub, orders, riders) keep their own page loaders.
 */
export function shouldShowDashboardNavOverlay(fromPath: string, toHref: string): boolean {
  const cleanPath = cleanDashboardHref(fromPath);
  const cleanTarget = cleanDashboardHref(toHref);
  if (isDashboardNavAlreadyAtTarget(cleanPath, cleanTarget)) return false;
  // Cross-module left-sidebar jumps — show GM while destination loads.
  if (isCrossModuleNavigation(cleanPath, cleanTarget)) return true;
  // Tickets hub + queue share one app shell; let client routes load their own loaders.
  if (
    cleanPath.startsWith("/dashboard/tickets") &&
    cleanTarget.startsWith("/dashboard/tickets")
  ) {
    return false;
  }
  // Orders list + standalone order detail share chrome; keep sidebars stable.
  if (
    (cleanPath.startsWith("/dashboard/orders") || cleanPath.startsWith("/order")) &&
    (cleanTarget.startsWith("/dashboard/orders") || cleanTarget.startsWith("/order"))
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
  // Merchant store portal tabs share the right rail; page clients own their loaders.
  // Overlay was covering z-40 RightSidebar and looked like the rail “hid” on every tab change.
  const storePathRe = /^\/dashboard\/merchants\/stores\/\d+(\/|$)/;
  if (storePathRe.test(cleanPath) && storePathRe.test(cleanTarget)) {
    return false;
  }
  return true;
}

/**
 * Path used for left-rail active highlight.
 * Prefer in-flight target so the clicked item lights up immediately; URL remains
 * the settled source of truth once navigation completes.
 */
export function resolveSidebarActivePath(
  pathname: string,
  pendingNavHref: string | null | undefined
): string {
  if (pendingNavHref) return cleanDashboardHref(pendingNavHref);
  return cleanDashboardHref(pathname);
}
