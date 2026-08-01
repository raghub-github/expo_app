import { clearDashboardAuthCaches } from "@/lib/dashboard-auth-client-state";

declare global {
  interface Window {
    __gatiRedirectingToLogin?: boolean;
  }
}

/**
 * Hard-redirect to /login when the session is dead.
 * Idempotent so parallel 401s don't spam navigation.
 */
export function redirectToLoginOnSessionExpired(options?: {
  reason?: string;
  redirectPath?: string;
  clearServerCookies?: boolean;
}): void {
  if (typeof window === "undefined") return;
  if (window.__gatiRedirectingToLogin) return;

  const path = window.location.pathname;
  if (path === "/login") return;

  window.__gatiRedirectingToLogin = true;
  clearDashboardAuthCaches();

  const fallbackRedirect =
    `${window.location.pathname}${window.location.search}` || "/dashboard";
  const params = new URLSearchParams();
  params.set("expired", "1");
  params.set("redirect", options?.redirectPath ?? fallbackRedirect);
  if (options?.reason) params.set("reason", options.reason);

  const go = () => {
    window.location.href = `/login?${params.toString()}`;
  };

  if (options?.clearServerCookies === false) {
    go();
    return;
  }

  // Best-effort cookie clear; always navigate even if logout fails.
  fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    .catch(() => {})
    .finally(go);
}

export function isSessionExpiredApiError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object" && error !== null) {
    const e = error as { status?: number | string; data?: { code?: string }; message?: string };
    if (e.status === 401) return true;
    if (e.data?.code === "SESSION_EXPIRED" || e.data?.code === "SESSION_INVALID") return true;
    if (
      typeof e.message === "string" &&
      e.message === "Your session has expired. Please log in again to continue."
    ) {
      return true;
    }
  }
  if (error instanceof Error) {
    return error.message === "Your session has expired. Please log in again to continue.";
  }
  return false;
}
