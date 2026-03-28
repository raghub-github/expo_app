import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import { createServerClient } from "@supabase/ssr";
import {
  getSessionMetadata,
  checkSessionValidity,
  updateActivity,
  expireSession,
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
// Keyed by pathname + method; value is last-sent timestamp (ms).
const auditLastSent = new Map<string, number>();
const AUDIT_MIN_INTERVAL_MS = 5000;
// Note: User validation is done in /api/auth/set-cookie, not in proxy
// Proxy runs in Edge Runtime which doesn't support database connections

function toResponseCookieOptions(options: {
  maxAge: number;
  path: string;
  httpOnly?: boolean;
  sameSite?: string;
  secure?: boolean;
}): Partial<ResponseCookie> {
  const same =
    options.sameSite === "strict" ||
    options.sameSite === "lax" ||
    options.sameSite === "none"
      ? options.sameSite
      : "lax";
  return {
    maxAge: options.maxAge,
    path: options.path,
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: same,
  };
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const normalizedRedirectPath = pathname === "/" ? "/dashboard" : pathname;
  // Set NEXT_PUBLIC_DEBUG_PROXY=true in .env.local to log [proxy] Path and redirect messages (off by default to reduce console noise).
  const debugProxy = process.env.NEXT_PUBLIC_DEBUG_PROXY === "true";
  if (debugProxy && !pathname.startsWith("/_next") && !pathname.startsWith("/api/audit")) {
    console.log("[proxy] Path:", pathname);
  }

  const response = NextResponse.next();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[proxy] Missing Supabase environment variables");
      return response;
    }

    // Create Supabase client for proxy
    // Note: Disable autoRefreshToken in proxy to avoid Edge Runtime fetch failures
    // Token refresh should happen in Server Components/API routes, not proxy
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
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
          autoRefreshToken: false, // Disabled in proxy to prevent Edge Runtime fetch failures
          persistSession: true,
          detectSessionInUrl: false, // Proxy doesn't handle OAuth redirects
        },
      }
    );

    // Use getUser() instead of getSession() to avoid triggering token refresh in proxy.
    // getSession() can refresh the token; multiple parallel calls (proxy + session-status + APIs)
    // cause "refresh_token_already_used". getUser() only validates the access token and does not refresh.
    const hasAuthCookie = request.cookies.has("sb-access-token") ||
                          request.cookies.has("sb-refresh-token") ||
                          request.cookies.getAll().some(c => c.name.startsWith("sb-"));

    // API routes: pass through immediately when auth cookies exist. Avoids calling getUser() in Edge
    // (which can throw "fetch failed") and lets the API route authenticate in Node instead.
    if (pathname.startsWith("/api/") && hasAuthCookie) {
      const cookieWrapper = {
        get: (name: string) => request.cookies.get(name) ?? undefined,
      };
      const metadata = getSessionMetadata(cookieWrapper);
      if (metadata) {
        const cookieManager = {
          get: (name: string) => request.cookies.get(name) ?? undefined,
          set: (name: string, value: string, options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }) => {
            setSafeResponseCookie(response, name, value, options);          },
        };
        updateActivity(cookieManager);
      }
      return response;
    }

    let session: { user: { id: string; email?: string }; [key: string]: unknown } | null = null;
    let sessionError: { message?: string; code?: string } | null = null;

    if (hasAuthCookie) {
      try {
        type AuthUserResult = {
          data?: { user?: { id: string; email?: string } | null };
          error?: { message?: string; code?: string };
        };
        const userResult = (await Promise.race([
          supabase.auth.getUser(),
          new Promise<{ data: { user: null }; error: { message: string; code: string } }>((resolve) =>
            setTimeout(() => resolve({ data: { user: null }, error: { message: "Session check timeout", code: "TIMEOUT" } }), 3000)
          ),
        ])) as unknown as AuthUserResult;
        const user = userResult.data?.user ?? null;
        sessionError = userResult.error ?? null;

        if (user) {
          session = {
            user: { id: user.id, email: user.email },
            ...user,
          } as unknown as typeof session;
        } else if (sessionError && (sessionError.code === "TIMEOUT" || sessionError.message?.includes("timeout"))) {
          session = null;
          sessionError = null;
        }
      } catch (err) {
        const error = err as { message?: string; code?: string; name?: string };
        const isFetchError =
          error.name === "TypeError" ||
          error.message?.includes("fetch failed") ||
          error.message?.includes("network") ||
          error.code === "ECONNREFUSED";
        if (isFetchError) {
          session = null;
          sessionError = null;
        } else {
          sessionError = error;
        }
      }
    }

    // Invalid/used refresh token or not found: clear cookies and redirect to login
    if (sessionError) {
      const isRefreshTokenNotFound =
        sessionError.code === "refresh_token_not_found" ||
        sessionError.message?.includes("refresh_token_not_found");
      const isInvalidOrUsedRefreshToken =
        sessionError.code === "refresh_token_already_used" ||
        sessionError.message?.includes("refresh_token_already_used") ||
        (sessionError.message ?? "").toLowerCase().includes("invalid refresh token");

      if (isRefreshTokenNotFound || isInvalidOrUsedRefreshToken) {
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
          redirectUrl.searchParams.set("redirect", pathname);
          redirectUrl.searchParams.set("reason", "session_invalid");
          return NextResponse.redirect(redirectUrl);
        }
      }
    }

    // Public routes: login, auth (including callback), and all /api/auth/* so clients always get JSON
    const publicRoutes = ["/login", "/auth", "/api/auth"];
    const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

    // If we have auth cookies but couldn't verify in Edge (timeout / "fetch failed"),
    // pass through for both API and page routes. API routes and Server Components can
    // authenticate in Node (cookies() + getSession()/getUser()). This prevents
    // redirecting logged-in users to login when Edge auth is flaky.
    if (hasAuthCookie && !session) {
      const cookieWrapper = {
        get: (name: string) => request.cookies.get(name) ?? undefined,
      };
      const metadata = getSessionMetadata(cookieWrapper);
      if (metadata) {
        const cookieManager = {
          get: (name: string) => request.cookies.get(name) ?? undefined,
          set: (name: string, value: string, options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }) => {
            setSafeResponseCookie(response, name, value, options);          },
        };
        updateActivity(cookieManager);
      }
      return response;
    }

    // If no Supabase session and trying to access protected route
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

    // If Supabase session exists and trying to access login, redirect to dashboard
    if (session && pathname === "/login") {
      if (debugProxy) console.log("[proxy] Session exists, redirecting from login to dashboard");
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // Avoid hitting app root ("/") runtime manifest path in production.
    // Route "/" is just a redirect to "/dashboard" anyway.
    if (session && pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // For protected routes, check custom session management and user validation
    if (session && !isPublicRoute) {
      // Get session metadata from cookies
      const cookieWrapper = {
        get: (name: string) => request.cookies.get(name),
      };

      const metadata = getSessionMetadata(cookieWrapper);
      const validity = checkSessionValidity(metadata);

      if (!validity.isValid) {
        if (debugProxy) console.log("[proxy] Session expired:", validity.reason);
        const cookieSetter = {
          set: (name: string, value: string, options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }) => {
            setSafeResponseCookie(response, name, value, options);
          },
        };
        expireSession(cookieSetter);
        await supabase.auth.signOut();

        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { success: false, error: "Session expired", code: "SESSION_EXPIRED" },
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/login";
        redirectUrl.searchParams.set("expired", validity.reason || "unknown");
        return NextResponse.redirect(redirectUrl);
      }

      // Note: User validation (checking system_users table) is done in /api/auth/set-cookie
      // We don't validate here because:
      // 1. Proxy runs in Edge Runtime which doesn't support database connections
      // 2. Validation is already done when session is set via set-cookie endpoint
      // 3. If session exists and is valid (time-wise), we trust it was validated during login

      // Session is valid - update last activity time
      const cookieManager = {
        get: (name: string) => request.cookies.get(name),
        set: (name: string, value: string, options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }) => {
          setSafeResponseCookie(response, name, value, options);
        },
      };
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

          // Fire-and-forget audit tracking
          // Don't block the request if audit tracking fails or times out
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
            // Silently ignore timeout, network, and fetch failures - audit tracking should never block requests
            // Edge/sandbox can fail with "fetch failed" for same-origin calls; don't log these
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
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
