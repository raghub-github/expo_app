import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getSessionMetadata,
  checkSessionValidity,
  updateActivity,
  initializeSession,
} from "@/lib/auth/session-manager";

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

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const normalizedRedirectPath = pathname === "/" ? "/dashboard" : pathname;
  const canTogglePortal = request.cookies.get("gm_portal_toggle_access")?.value === "1";
  const debugProxy = process.env.NEXT_PUBLIC_DEBUG_PROXY === "true";
  if (debugProxy && !pathname.startsWith("/_next") && !pathname.startsWith("/api/audit")) {
    console.log("[proxy] Path:", pathname);
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

    const hasAuthCookie =
      request.cookies.has("sb-access-token") ||
      request.cookies.has("sb-refresh-token") ||
      request.cookies.getAll().some((c) => c.name.startsWith("sb-"));

    // Let auth API routes handle their own session exchange / cookie writes.
    if (
      pathname.startsWith("/api/auth/set-cookie") ||
      pathname.startsWith("/api/auth/callback")
    ) {
      return response;
    }

    // sb-* cookies present: pass through to Node route handlers for getUser() auth.
    // Never expire partner metadata cookies here — stale metadata is re-init'd, not wiped.
    if (hasAuthCookie) {
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

      if (!metadata || !validity.isValid) {
        if (debugProxy) {
          console.log("[proxy] Partner session metadata stale — re-init:", validity.reason);
        }
        initializeSession(cookieManager);
      } else {
        updateActivity(cookieManager);
      }

      return response;
    }

    let session: { user: { id: string; email?: string }; [key: string]: unknown } | null = null;
    let sessionError: { message?: string; code?: string } | null = null;

    try {
      type AuthUserResult = {
        data?: { user?: { id: string; email?: string } | null };
        error?: { message?: string; code?: string };
      };
      const getUserSafe = supabase.auth.getUser().then(
        (r) => r as AuthUserResult,
        (err: unknown) => {
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

      if (isAlreadyUsed) {
        sessionError = null;
      } else if (isRefreshTokenNotFound || isInvalidRefresh) {
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        session = null;
        sessionError = null;
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { success: false, error: "Session invalid", code: "SESSION_INVALID" },
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!pathname.startsWith("/login") && !pathname.startsWith("/auth/callback")) {
          const redirectUrl = request.nextUrl.clone();
          redirectUrl.pathname = "/login";
          redirectUrl.searchParams.set("redirect", normalizedRedirectPath);
          redirectUrl.searchParams.set("reason", "session_invalid");
          return NextResponse.redirect(redirectUrl);
        }
      }
    }

    const publicRoutes = ["/login", "/auth", "/api/auth", "/api/health"];
    const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

    if (!session && !isPublicRoute) {
      if (debugProxy) {
        console.log("[proxy] No Supabase session, redirecting to login");
      }
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("redirect", normalizedRedirectPath);
      return NextResponse.redirect(redirectUrl);
    }

    if (session && pathname === "/login") {
      if (debugProxy) console.log("[proxy] Session exists, redirecting from login to dashboard");
      return NextResponse.redirect(new URL("/dashboard", request.url), 303);
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

      if (!validity.isValid) {
        if (debugProxy) {
          console.log("[proxy] Partner session metadata stale — re-init:", validity.reason);
        }
        initializeSession(cookieManager);
      }

      updateActivity(cookieManager);

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
    console.error("[proxy] FATAL ERROR:", error);
    return continueRequest(request);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
