import { clearDashboardAuthCaches } from "@/lib/dashboard-auth-client-state";
import { isHardSessionDeathCode } from "@/lib/auth/session-errors";

declare global {
  interface Window {
    __gatiRedirectingToLogin?: boolean;
    __gatiAuthFetchGuardInstalled?: boolean;
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
  if (path === "/login" || path.startsWith("/login?")) return;

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

/** True for API/session payloads that mean the user must sign in again. */
export function isUnauthenticatedApiPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as { error?: unknown; code?: unknown; message?: unknown };
  const code = String(p.code ?? "").toUpperCase();
  if (
    code === "SESSION_REQUIRED" ||
    code === "SESSION_INVALID" ||
    code === "SESSION_EXPIRED" ||
    code === "UNAUTHENTICATED"
  ) {
    return true;
  }
  return isUnauthenticatedErrorMessage(
    [p.error, p.message].filter((x) => typeof x === "string").join(" ")
  );
}

/** True for human-readable auth failure strings (never show these in UI banners). */
export function isUnauthenticatedErrorMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  if (!m) return false;
  return (
    m === "not authenticated" ||
    m.includes("not authenticated") ||
    m.includes("session required") ||
    m.includes("session invalid") ||
    m.includes("session expired") ||
    m.includes("your session has expired") ||
    m.includes("sign in required") ||
    m.includes("please log in") ||
    m.includes("please sign in") ||
    m.includes("redirecting to login")
  );
}

/**
 * If `error` is an auth/session failure, logout + redirect and return true.
 * Call sites should skip rendering banners when this returns true.
 */
export function redirectIfUnauthenticatedError(
  error: unknown,
  reason = "not_authenticated"
): boolean {
  if (typeof window === "undefined") return false;
  if (window.__gatiRedirectingToLogin) return true;

  if (typeof error === "string" && isUnauthenticatedErrorMessage(error)) {
    if (
      error.toLowerCase().includes("expired") ||
      error.toLowerCase().includes("invalid")
    ) {
      redirectToLoginOnSessionExpired({ reason });
      return true;
    }
    return false;
  }
  if (error instanceof Error && isUnauthenticatedErrorMessage(error.message)) {
    const msg = error.message.toLowerCase();
    if (msg.includes("expired") || msg.includes("invalid")) {
      redirectToLoginOnSessionExpired({ reason });
      return true;
    }
    return false;
  }
  if (isSessionExpiredApiError(error)) {
    redirectToLoginOnSessionExpired({ reason });
    return true;
  }
  if (isUnauthenticatedApiPayload(error)) {
    const code =
      error && typeof error === "object"
        ? String((error as { code?: unknown }).code ?? "").toUpperCase()
        : "";
    if (isHardSessionDeathCode(code)) {
      redirectToLoginOnSessionExpired({ reason: code || reason });
      return true;
    }
  }
  return false;
}

export function isSessionExpiredApiError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object" && error !== null) {
    const e = error as { status?: number | string; data?: { code?: string; error?: string }; message?: string };
    if (isHardSessionDeathCode(e.data?.code)) return true;
    // Generic 401/403 without an explicit dead-session code may be abort/transient — do not logout.
    if (typeof e.data?.error === "string" && isUnauthenticatedErrorMessage(e.data.error)) {
      return isHardSessionDeathCode(e.data.code);
    }
    if (typeof e.message === "string" && isUnauthenticatedErrorMessage(e.message)) {
      return isHardSessionDeathCode(e.data?.code);
    }
  }
  return false;
}

const AUTH_FETCH_SKIP_PREFIXES = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/callback",
  "/api/auth/otp",
  "/api/auth/verify",
  "/api/auth/force-logout",
];

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

function shouldGuardApiUrl(url: string): boolean {
  try {
    const path = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0] || "";
    if (!path.startsWith("/api/")) return false;
    if (AUTH_FETCH_SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Patch `window.fetch` once so any dashboard `/api/*` 401/auth failure
 * logs the user out instead of leaving pages to render "Not authenticated" banners.
 * Install from the authenticated shell only.
 */
export function installDashboardAuthFetchGuard(): void {
  if (typeof window === "undefined") return;
  if (window.__gatiAuthFetchGuardInstalled) return;
  window.__gatiAuthFetchGuardInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await nativeFetch(input, init);

    try {
      if (window.__gatiRedirectingToLogin) return response;
      const path = window.location.pathname || "";
      if (path === "/login" || path.startsWith("/login/")) return response;

      const url = resolveFetchUrl(input);
      if (!shouldGuardApiUrl(url)) return response;

      // Auth session probes: only hard-logout on explicit dead-session codes.
      const pathname = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0] || "";
      const isAuthProbe =
        pathname === "/api/auth/session" ||
        pathname === "/api/auth/session-status" ||
        pathname === "/api/auth/bootstrap";

      if (response.status !== 401 && response.status !== 403) return response;

      const contentType = response.headers.get("content-type") ?? "";
      let payload: unknown = null;
      if (contentType.includes("application/json")) {
        try {
          payload = await response.clone().json();
        } catch {
          payload = null;
        }
      }

      const code =
        payload && typeof payload === "object"
          ? String((payload as { code?: unknown }).code ?? "").toUpperCase()
          : "";
      // Never hard-logout on transient/abort/permission-denied codes.
      // (499/503 already returned above — status here is only 401|403.)
      if (
        code === "SERVICE_UNAVAILABLE" ||
        code === "REQUEST_ABORTED" ||
        code === "FORBIDDEN" ||
        code === "SESSION_REQUIRED" ||
        code === "UNAUTHENTICATED" ||
        !code
      ) {
        return response;
      }

      // Bare 403 without a dead-session code is usually RBAC, not auth death.
      if (response.status === 403 && !isHardSessionDeathCode(code)) {
        return response;
      }

      if (isAuthProbe) {
        // SESSION_REQUIRED on bootstrap/session probes is often a transient race right
        // after set-cookie or during parallel ticket-detail loads — never hard-logout for it.
        if (isHardSessionDeathCode(code)) {
          redirectToLoginOnSessionExpired({ reason: code });
        }
        return response;
      }

      // Only hard-logout on explicit dead-session codes — bare 401 may be abort/transient.
      if (isHardSessionDeathCode(code)) {
        redirectToLoginOnSessionExpired({ reason: code });
      }
    } catch {
      // Never break the original caller.
    }

    return response;
  };
}
