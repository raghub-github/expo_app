export function cleanDashboardHref(href: string): string {
  return href.split("?")[0].split("#")[0];
}

/** Full location key (path + query) for same-route navigations (e.g. verification ?step=). */
export function dashboardLocationKey(href: string): string {
  const raw = (href || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, "https://local.invalid");
    const path = u.pathname.replace(/\/$/, "") || "/";
    const params = new URLSearchParams(u.search);
    const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const qs = new URLSearchParams(entries).toString();
    return qs ? `${path}?${qs}` : path;
  } catch {
    return cleanDashboardHref(raw);
  }
}

/** True only when the user is already on the module root (not a nested sub-route). */
export function isDashboardNavAlreadyAtTarget(fromPath: string, toHref: string): boolean {
  return cleanDashboardHref(fromPath) === cleanDashboardHref(toHref);
}

/** True when pathname and query string both match (ignores hash). */
export function isDashboardNavExactlyAtTarget(fromHref: string, toHref: string): boolean {
  return dashboardLocationKey(fromHref) === dashboardLocationKey(toHref);
}

/** Top-level dashboard module prefix, e.g. `/dashboard/riders`. */
export function getDashboardModuleKey(path: string): string {
  const clean = cleanDashboardHref(path);
  if (clean === "/dashboard") return "/dashboard";
  const match = clean.match(/^(\/dashboard\/[^/]+)/);
  return match ? match[1] : clean;
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
  // Nested Super Admin settings (App Category, App images, …) must not count as
  // having reached the hub — that dropped the in-flight back push on first click.
  if (tgt === "/dashboard/super-admin") return false;
  // Module-root clicks may land on a nested child (e.g. /dashboard/riders/123).
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
  // Customer inner pages (users-by-state, profile) own their loaders. Overlay +
  // cancelQueries was aborting stats / users-by-state on first visit and wiping
  // cards when navigating back.
  if (
    cleanPath.startsWith("/dashboard/customers") &&
    cleanTarget.startsWith("/dashboard/customers")
  ) {
    return false;
  }
  // Merchant store portal tabs share the right rail; page clients own their loaders.
  // Overlay was covering z-40 RightSidebar and looked like the rail “hid” on every tab change.
  const storePathRe = /^\/dashboard\/merchants\/stores\/\d+(\/|$)/;
  if (storePathRe.test(cleanPath) && storePathRe.test(cleanTarget)) {
    return false;
  }
  // Super Admin hub ↔ inner settings: instant header back, no blocking overlay.
  if (
    cleanPath.startsWith("/dashboard/super-admin") &&
    cleanTarget.startsWith("/dashboard/super-admin")
  ) {
    return false;
  }
  // Merchant verification step back uses query-only changes on one pathname.
  if (
    cleanPath.startsWith("/dashboard/merchants/verifications") &&
    cleanTarget.startsWith("/dashboard/merchants/verifications")
  ) {
    return false;
  }
  if (cleanPath.startsWith("/dashboard/users") && cleanTarget.startsWith("/dashboard/users")) {
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
