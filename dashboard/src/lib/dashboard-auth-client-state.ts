import { clearBootstrapFromStorage } from "@/lib/dashboard-bootstrap-storage";

export const HEADER_IDENTITY_CACHE_KEY = "dashboard_header_identity_v1";
export const SERVER_COOKIE_SYNCED_KEY = "gm_server_cookie_synced_v1";
export const DASHBOARD_FORCE_BOOTSTRAP_KEY = "dashboard_force_bootstrap_refresh";

declare global {
  interface Window {
    __gatiBootstrapDone?: boolean;
  }
}

/** Drop all client-side auth/bootstrap caches (call on logout). */
export function clearDashboardAuthCaches(): void {
  if (typeof window === "undefined") return;

  clearBootstrapFromStorage();

  try {
    window.localStorage.removeItem(HEADER_IDENTITY_CACHE_KEY);
    window.localStorage.removeItem(SERVER_COOKIE_SYNCED_KEY);
  } catch {
    // ignore
  }

  window.__gatiBootstrapDone = false;
}

/**
 * Call immediately before navigating to /dashboard after a successful login.
 * Clears prior bootstrap cache and forces a fresh bootstrap fetch.
 * Does not clear the server cookie sync flag — login just posted tokens via set-cookie.
 */
export function markDashboardFreshLogin(): void {
  if (typeof window === "undefined") return;

  clearBootstrapFromStorage();
  window.__gatiBootstrapDone = false;

  try {
    window.sessionStorage.setItem(DASHBOARD_FORCE_BOOTSTRAP_KEY, "1");
  } catch {
    // ignore
  }
}

/** Returns true once per fresh login; consumed so bootstrap gate refetches from network. */
export function consumeForceBootstrapRefresh(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const flag = window.sessionStorage.getItem(DASHBOARD_FORCE_BOOTSTRAP_KEY);
    if (flag === "1") {
      window.sessionStorage.removeItem(DASHBOARD_FORCE_BOOTSTRAP_KEY);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}
