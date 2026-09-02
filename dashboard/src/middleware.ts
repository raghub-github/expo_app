import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getSessionMetadata,
  checkSessionValidity,
  updateActivity,
  initializeSession,
  expireSession,
  isMeaningfulActivityRequest,
} from "@/lib/auth/session-manager";
import {
  isRefreshTokenAlreadyUsed,
  isRefreshTokenNotFound,
  isTimeoutOrAbortError,
} from "@/lib/auth/session-errors";
import { fetchWithTimeout } from "@/lib/supabase/fetch-timeout";
import {
  isCookieAccessTokenUsable,
  readCookieAccessSession,
} from "@/lib/auth/read-cookie-access-session";

/** Normalize cookie options so `sameSite` matches Next.js ResponseCookie (not plain string). */
function setSafeResponseCookie(
  response: NextResponse,
  name: string,
  value: string,
  options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }
) {
  const sameSite =
    options.sameSite === "lax" ||
    options.sameSite === "strict" ||
    options.sameSite === "none"
      ? options.sameSite
      : undefined;
  response.cookies.set(name, value, {
    maxAge: options.maxAge,
    path: options.path,
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite,
  });
}

// Throttle audit tracking per route to avoid spamming /api/audit/track.
const auditLastSent = new Map<string, number>();
const AUDIT_MIN_INTERVAL_MS = 5000;

/** Pass the (possibly cookie-mutated) request through — required for direct URL hits in Next 16 dev. */
function continueRequest(request: NextRequest): NextResponse {
  return NextResponse.next({ request });
}

function clearSupabaseAuthCookies(response: NextResponse, request: NextRequest): void {
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("sb-")) {
      response.cookies.set(c.name, "", { path: "/", maxAge: 0 });
    }
  }
}

function unauthenticatedLoginRedirect(request: NextRequest, pathname: string): NextResponse {
  const redirectUrl = new URL("/login", request.url);
  const search = request.nextUrl.search;
  const redirectTarget =
    pathname === "/"
      ? "/dashboard"
      : `${pathname}${search && search !== "?" ? search : ""}`;
  if (redirectTarget.startsWith("/") && !redirectTarget.startsWith("//")) {
    redirectUrl.searchParams.set("redirect", redirectTarget);
  }
  return NextResponse.redirect(redirectUrl);
}

function recoverUnifiedSessionIfJwtUsable(
  request: NextRequest,
  cookieManager: {
    get: (name: string) => { value: string } | undefined;
    set: (
      name: string,
      value: string,
      options: {
        maxAge: number;
        path: string;
        httpOnly?: boolean;
        sameSite?: string;
        secure?: boolean;
      }
    ) => void;
  }
): boolean {
  const cookieSession = readCookieAccessSession({
    get: (name) => request.cookies.get(name),
    getAll: () => request.cookies.getAll(),
  });
  if (!isCookieAccessTokenUsable(cookieSession)) return false;
  initializeSession(cookieManager);
  return true;
}

function deadSessionRedirect(
  request: NextRequest,
  normalizedRedirectPath: string,
  pathname: string
): NextResponse {
  if (pathname.startsWith("/api/")) {
    const res = NextResponse.json(
      { success: false, error: "Session invalid", code: "SESSION_INVALID" },
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
    clearSupabaseAuthCookies(res, request);
    return res;
  }
  if (!pathname.startsWith("/login") && !pathname.startsWith("/auth/callback")) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirect", normalizedRedirectPath);
    redirectUrl.searchParams.set("reason", "session_invalid");
    redirectUrl.searchParams.set("expired", "1");
    const res = NextResponse.redirect(redirectUrl);
    clearSupabaseAuthCookies(res, request);
    return res;
  }
  const res = continueRequest(request);
  clearSupabaseAuthCookies(res, request);
  return res;
}

async function probeAuthUser(
  supabase: ReturnType<typeof createServerClient>
): Promise<{ user: { id: string; email?: string } | null; error: { message?: string; code?: string } | null }> {
  type AuthUserResult = {
    data?: { user?: { id: string; email?: string } | null };
    error?: { message?: string; code?: string } | null;
  };
  try {
    const getUserPromise = supabase.auth.getUser().then(
      (r: AuthUserResult) => ({ user: r.data?.user ?? null, error: r.error ?? null }),
      (err: unknown) => {
        if (isTimeoutOrAbortError(err)) {
          return { user: null, error: { message: "Auth probe timeout", code: "TIMEOUT" } };
        }
        const e = err as { message?: string; code?: string };
        return {
          user: null,
          error: { message: e?.message ?? "fetch failed", code: e?.code ?? "FETCH_FAILED" },
        };
      }
    );
    // Timeout may win — swallow late AbortError / AuthFetchTimeoutError permanently.
    void getUserPromise.catch(() => undefined);

    return await Promise.race([
      getUserPromise,
      new Promise<{ user: null; error: { message: string; code: string } }>((resolve) =>
        setTimeout(
          () => resolve({ user: null, error: { message: "Session check timeout", code: "TIMEOUT" } }),
          2500
        )
      ),
    ]);
  } catch (err) {
    if (isTimeoutOrAbortError(err)) {
      return { user: null, error: { message: "Auth probe timeout", code: "TIMEOUT" } };
    }
    const e = err as { message?: string; code?: string };
    return { user: null, error: { message: e?.message ?? "Session check failed", code: e?.code ?? "FETCH_FAILED" } };
  }
}

/** Avoid calling Auth getUser on every HTML navigation within a short window. */
let pageAuthProbeOkUntil = 0;
let pageAuthProbeNetworkDownUntil = 0;
const PAGE_AUTH_PROBE_OK_MS = 60_000;
const PAGE_AUTH_PROBE_NETWORK_COOLDOWN_MS = 60_000;

function isProbeNetworkError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const code = (error.code ?? "").toUpperCase();
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "TIMEOUT" ||
    code === "FETCH_FAILED" ||
    code === "ABORT" ||
    code === "ABORT_ERR" ||
    code.includes("CONNECT") ||
    msg.includes("timeout") ||
    msg.includes("fetch failed") ||
    msg.includes("connect") ||
    msg.includes("aborted") ||
    msg.includes("abort")
  );
}

async function probeAuthUserForPageNavigation(
  supabase: ReturnType<typeof createServerClient>,
  request?: NextRequest
): Promise<{ user: { id: string; email?: string } | null; error: { message?: string; code?: string } | null }> {
  const now = Date.now();
  if (now < pageAuthProbeNetworkDownUntil) {
    // Soft-pass: do not treat Auth outage as dead session.
    return { user: { id: "network-cooldown" }, error: null };
  }
  if (now < pageAuthProbeOkUntil) {
    return { user: { id: "probe-cached" }, error: null };
  }

  if (request) {
    const cookieSession = readCookieAccessSession({
      get: (name) => request.cookies.get(name),
      getAll: () => request.cookies.getAll(),
    });
    if (isCookieAccessTokenUsable(cookieSession) && cookieSession?.user?.id) {
      pageAuthProbeOkUntil = now + PAGE_AUTH_PROBE_OK_MS;
      return {
        user: { id: cookieSession.user.id, email: cookieSession.user.email },
        error: null,
      };
    }
  }

  const probe = await probeAuthUser(supabase);
  if (probe.user) {
    pageAuthProbeOkUntil = now + PAGE_AUTH_PROBE_OK_MS;
    return probe;
  }
  if (isProbeNetworkError(probe.error)) {
    pageAuthProbeNetworkDownUntil = now + PAGE_AUTH_PROBE_NETWORK_COOLDOWN_MS;
    // Soft-pass on ConnectTimeout — API routes authenticate themselves.
    return { user: { id: "network-soft" }, error: null };
  }
  return probe;
}

function isDeadRefreshError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (isRefreshTokenAlreadyUsed(error)) return false;
  // Parallel refresh loser — do not wipe the winner's cookies.
  if (isRefreshTokenNotFound(error)) return false;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("invalid refresh token");
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const normalizedRedirectPath = pathname === "/" ? "/dashboard" : pathname;
  const canTogglePortal = request.cookies.get("gm_portal_toggle_access")?.value === "1";
  const debugProxy = process.env.NEXT_PUBLIC_DEBUG_PROXY === "true";
  if (debugProxy && !pathname.startsWith("/_next") && !pathname.startsWith("/api/audit")) {
    console.log("[proxy] Path:", pathname);
  }

  // Client cancelled (React Query / badge poll) — exit quietly, never AbortError spam.
  if (request.signal.aborted) {
    return continueRequest(request);
  }

  const response = continueRequest(request);

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[proxy] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
      return response;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      global: {
        fetch: fetchWithTimeout,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            if (name.startsWith("sb-") && (!value || value.length === 0)) {
              return;
            }
            request.cookies.set(name, value);
            if (options) {
              setSafeResponseCookie(response, name, value, {
                maxAge: options.maxAge ?? 0,
                path: options.path ?? "/",
                httpOnly: options.httpOnly,
                sameSite: options.sameSite as string | undefined,
                secure: options.secure,
              });
            }
          });
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });

    const cookieHeader = request.headers.get("cookie") ?? "";
    const hasAuthCookie =
      request.cookies.has("sb-access-token") ||
      request.cookies.has("sb-refresh-token") ||
      request.cookies.getAll().some((c) => c.name.startsWith("sb-")) ||
      /(?:^|;\s*)sb-/.test(cookieHeader);

    // Let auth API routes handle their own session exchange / cookie writes.
    if (
      pathname.startsWith("/api/auth/set-cookie") ||
      pathname.startsWith("/api/auth/callback")
    ) {
      return response;
    }

    // sb-* cookies present.
    // IMPORTANT: Do NOT call Auth getUser() on every /api/* request — that was the
    // root cause of ConnectTimeoutError storms to *.supabase.co while tickets polled.
    // API routes authenticate via resolveSupabaseUser (cookie-first). Page navigations
    // still probe occasionally (cached) to catch dead refresh tokens.
    if (hasAuthCookie) {
      const isApiRoute = pathname.startsWith("/api/");
      if (!isApiRoute) {
        const probe = await probeAuthUserForPageNavigation(supabase, request);
        if (!probe.user && isDeadRefreshError(probe.error)) {
          // Soft-pass when the access JWT cookie is still usable. Hard-clearing
          // sb-* on refresh races was wiping the shared session for other tabs
          // (dashboard still open → cascade of 401s after /order → /login).
          const cookieSession = readCookieAccessSession({
            get: (name) => request.cookies.get(name),
            getAll: () => request.cookies.getAll(),
          });
          if (!isCookieAccessTokenUsable(cookieSession)) {
            return deadSessionRedirect(request, normalizedRedirectPath, pathname);
          }
        }
      }

      const cookieWrapper = {
        get: (name: string) => request.cookies.get(name) ?? undefined,
      };
      const cookieManager = {
        get: (name: string) => request.cookies.get(name) ?? undefined,
        set: (
          name: string,
          value: string,
          options: {
            maxAge: number;
            path: string;
            httpOnly?: boolean;
            sameSite?: string;
            secure?: boolean;
          }
        ) => {
          setSafeResponseCookie(response, name, value, options);
        },
      };

      const metadata = getSessionMetadata(cookieWrapper);
      const validity = checkSessionValidity(metadata);

      // Missing partner cookies (first login after deploy / legacy): create once.
      // Expired idle/rolling/absolute: re-init if the Auth JWT is still usable.
      if (!metadata || validity.reason === "no_session") {
        initializeSession(cookieManager);
      } else if (!validity.isValid) {
        if (debugProxy) {
          console.log("[proxy] Unified session expired:", validity.reason);
        }
        if (!recoverUnifiedSessionIfJwtUsable(request, cookieManager)) {
          expireSession(cookieManager);
          return deadSessionRedirect(request, normalizedRedirectPath, pathname);
        }
      } else if (
        isMeaningfulActivityRequest(pathname, request.method, request.nextUrl.search)
      ) {
        updateActivity(cookieManager);
      }

      return response;
    }

    let session: { user: { id: string; email?: string }; [key: string]: unknown } | null = null;
    let sessionError: { message?: string; code?: string } | null = null;
    let authProbeTimedOut = false;

    try {
      type AuthUserResult = {
        data?: { user?: { id: string; email?: string } | null };
        error?: { message?: string; code?: string };
      };
      const getUserSafe = supabase.auth.getUser().then(
        (r) => r as AuthUserResult,
        (err: unknown) => {
          if (isTimeoutOrAbortError(err)) {
            return {
              data: { user: null },
              error: { message: "Session check timeout", code: "TIMEOUT" },
            } satisfies AuthUserResult;
          }
          const e = err as { message?: string; code?: string; name?: string };
          return {
            data: { user: null },
            error: {
              message: e?.message ?? "fetch failed",
              code: e?.code ?? e?.name ?? "FETCH_FAILED",
            },
          } satisfies AuthUserResult;
        }
      );
      void getUserSafe.catch(() => undefined);
      const userResult = (await Promise.race([
        getUserSafe,
        new Promise<AuthUserResult>((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: { user: null },
                error: { message: "Session check timeout", code: "TIMEOUT" },
              }),
            2500
          )
        ),
      ])) as AuthUserResult;
      const user = userResult.data?.user ?? null;
      sessionError = userResult.error ?? null;

      if (user) {
        session = {
          user: { id: user.id, email: user.email },
          ...user,
        } as unknown as typeof session;
        sessionError = null;
      } else if (
        sessionError &&
        (sessionError.code === "TIMEOUT" ||
          sessionError.code === "FETCH_FAILED" ||
          sessionError.message?.includes("timeout") ||
          sessionError.message?.includes("fetch failed") ||
          sessionError.message?.toLowerCase().includes("connect timeout"))
      ) {
        authProbeTimedOut = true;
        session = null;
        sessionError = null;
      }
    } catch (err) {
      const error = err as { message?: string; code?: string; name?: string };
      const isFetchError =
        error.name === "TypeError" ||
        error.message?.includes("fetch failed") ||
        error.message?.includes("network") ||
        error.message?.toLowerCase().includes("timeout") ||
        error.code === "ECONNREFUSED" ||
        error.code === "UND_ERR_CONNECT_TIMEOUT";
      if (isFetchError) {
        authProbeTimedOut = true;
        session = null;
        sessionError = null;
      } else {
        sessionError = error;
      }
    }

    if (sessionError) {
      const isRefreshTokenNotFound =
        sessionError.code === "refresh_token_not_found" ||
        sessionError.message?.includes("refresh_token_not_found");
      const isAlreadyUsed =
        sessionError.code === "refresh_token_already_used" ||
        sessionError.message?.includes("refresh_token_already_used");
      const isInvalidRefresh = (sessionError.message ?? "").toLowerCase().includes("invalid refresh token");

      if (isAlreadyUsed || isRefreshTokenNotFound) {
        sessionError = null;
      } else if (isInvalidRefresh) {
        const cookieSession = readCookieAccessSession({
          get: (name) => request.cookies.get(name),
          getAll: () => request.cookies.getAll(),
        });
        if (!isCookieAccessTokenUsable(cookieSession)) {
          return deadSessionRedirect(request, normalizedRedirectPath, pathname);
        }
        sessionError = null;
      }
    }

    const publicRoutes = [
      "/login",
      "/auth",
      "/api/auth",
      "/api/health",
      "/api/onboarding",
    ];
    const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

    if (!session && !isPublicRoute) {
      if (debugProxy) {
        console.log("[proxy] No Supabase session, redirecting to login");
      }
      // Auth probe timeout/network miss during compile: cookies may exist but
      // getUser hung. Never bounce the user to login or 401 SESSION_REQUIRED.
      if (authProbeTimedOut) {
        // API routes authenticate cookie-first in route handlers — never block
        // the whole order page on a transient Supabase fetch/timeout in middleware.
        return continueRequest(request);
      }
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      return unauthenticatedLoginRedirect(request, pathname);
    }

    if (session && pathname === "/login") {
      if (debugProxy) console.log("[proxy] Session exists, redirecting from login to requested path");
      const redirectParam = request.nextUrl.searchParams.get("redirect");
      const safeRedirect =
        redirectParam?.startsWith("/") &&
        !redirectParam.startsWith("//") &&
        !redirectParam.startsWith("/login") &&
        !redirectParam.startsWith("/auth")
          ? redirectParam
          : "/dashboard";
      return NextResponse.redirect(new URL(safeRedirect, request.url), 303);
    }

    if (session && pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    if (session && !isPublicRoute) {
      const requestedPortal = request.nextUrl.searchParams.get("portal");
      const isAdminPortalRequest =
        pathname.startsWith("/admin") ||
        (pathname.startsWith("/dashboard/merchants") && requestedPortal === "admin");
      if (isAdminPortalRequest && !canTogglePortal) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { success: false, error: "Access Denied" },
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
        const redirectUrl = request.nextUrl.clone();
        if (pathname.startsWith("/dashboard/merchants")) {
          redirectUrl.pathname = pathname;
          redirectUrl.searchParams.set("portal", "merchant");
        } else {
          redirectUrl.pathname = "/dashboard/merchants";
          redirectUrl.searchParams.set("portal", "merchant");
        }
        return NextResponse.redirect(redirectUrl);
      }

      const cookieWrapper = {
        get: (name: string) => request.cookies.get(name),
      };

      const metadata = getSessionMetadata(cookieWrapper);
      const validity = checkSessionValidity(metadata);

      const cookieManager = {
        get: (name: string) => request.cookies.get(name),
        set: (
          name: string,
          value: string,
          options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }
        ) => {
          setSafeResponseCookie(response, name, value, options);
        },
      };

      if (!metadata || validity.reason === "no_session") {
        initializeSession(cookieManager);
      } else if (!validity.isValid) {
        if (debugProxy) {
          console.log("[proxy] Unified session expired:", validity.reason);
        }
        if (!recoverUnifiedSessionIfJwtUsable(request, cookieManager)) {
          expireSession(cookieManager);
          return deadSessionRedirect(request, normalizedRedirectPath, pathname);
        }
      } else if (
        isMeaningfulActivityRequest(pathname, request.method, request.nextUrl.search)
      ) {
        updateActivity(cookieManager);
      }

      const shouldTrack =
        pathname !== "/api/audit/track" &&
        !pathname.startsWith("/api/audit/track") &&
        !pathname.startsWith("/_next") &&
        !pathname.startsWith("/favicon.ico");

      if (shouldTrack && process.env.NODE_ENV !== "development") {
        const isApiRequest = pathname.startsWith("/api/");
        const actionType = (() => {
          switch (request.method.toUpperCase()) {
            case "POST":
              return "CREATE";
            case "PUT":
            case "PATCH":
              return "UPDATE";
            case "DELETE":
              return "DELETE";
            default:
              return "VIEW";
          }
        })();

        const resolveDashboardType = (path: string) => {
          const lower = path.toLowerCase();
          if (lower.includes("/rider")) return "RIDER";
          if (lower.includes("/merchant")) return "MERCHANT";
          if (lower.includes("/customer")) return "CUSTOMER";
          if (lower.includes("/order")) return "ORDER";
          if (lower.includes("/ticket")) return "TICKET";
          if (lower.includes("/offer")) return "OFFER";
          if (lower.includes("/area-manager")) return "AREA_MANAGER";
          if (lower.includes("/payment")) return "PAYMENT";
          if (lower.includes("/analytics")) return "ANALYTICS";
          return "SYSTEM";
        };

        const dashboardType = resolveDashboardType(pathname);
        const throttleKey = `${pathname}:${request.method}`;
        const now = Date.now();
        const last = auditLastSent.get(throttleKey) ?? 0;

        if (now - last >= AUDIT_MIN_INTERVAL_MS) {
          auditLastSent.set(throttleKey, now);

          fetch(new URL("/api/audit/track", request.url), {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: request.headers.get("cookie") || "",
              "x-forwarded-for": request.headers.get("x-forwarded-for") || "",
              "user-agent": request.headers.get("user-agent") || "",
            },
            body: JSON.stringify({
              eventType: isApiRequest ? "API_CALL" : "PAGE_VIEW",
              dashboardType,
              actionType,
              resourceType: isApiRequest ? "API" : "PAGE",
              resourceId: pathname,
              actionDetails: {
                path: pathname,
                method: request.method,
              },
              requestPath: pathname,
              requestMethod: request.method,
            }),
          }).catch((error) => {
            const isExpected =
              error.name === "HeadersTimeoutError" ||
              error.message?.includes("timeout") ||
              error.message?.includes("fetch failed");
            if (!isExpected) {
              console.error("[proxy] Audit tracking failed:", error);
            }
          });
        }
      }
    }

    return response;
  } catch (error) {
    if (isTimeoutOrAbortError(error) || request.signal.aborted) {
      return continueRequest(request);
    }
    console.error("[proxy] FATAL ERROR:", error);
    return continueRequest(request);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
