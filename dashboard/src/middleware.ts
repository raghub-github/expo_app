import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getSessionMetadata,
  checkSessionValidity,
  updateActivity,
  expireSession,
} from "@/lib/auth/session-manager";
// Note: User validation is done in /api/auth/set-cookie, not in middleware
// Middleware runs in Edge Runtime which doesn't support database connections

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Only log in development to reduce noise
  if (process.env.NODE_ENV === 'development' && !pathname.startsWith('/_next') && !pathname.startsWith('/api/audit')) {
    console.log("[middleware] Path:", pathname);
  }
  
  const response = NextResponse.next();

  try {
    // Create Supabase client for middleware
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
          },
        },
        auth: {
          autoRefreshToken: true,
          persistSession: true,
        },
      }
    );

    // Get current Supabase session (suppress expected errors, handle invalid token)
    let session = null;
    let sessionError: { message?: string; code?: string } | null = null;
    try {
      const sessionResult = await supabase.auth.getSession();
      session = sessionResult.data?.session || null;
      sessionError = sessionResult.error as { message?: string; code?: string } | null;

      const isRefreshTokenNotFound =
        sessionError?.code === "refresh_token_not_found" ||
        sessionError?.message?.includes("refresh_token_not_found");
      const isInvalidOrUsedRefreshToken =
        sessionError &&
        (sessionError.code === "refresh_token_already_used" ||
          sessionError.message?.includes("refresh_token_already_used") ||
          sessionError.message?.toLowerCase().includes("invalid refresh token"));

      // Refresh token not found or invalid: clear auth cookies once, then treat as no session
      if (isRefreshTokenNotFound || isInvalidOrUsedRefreshToken) {
        if (process.env.NODE_ENV === "development" && isInvalidOrUsedRefreshToken) {
          console.log("[middleware] Invalid/used refresh token, clearing session");
        }
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore signOut errors
        }
        session = null;
        sessionError = null;
        // For /api/* always return JSON so clients never receive HTML redirect
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { success: false, error: "Session invalid", code: "SESSION_INVALID" },
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }
        // Allow /login and /auth/callback to load so user can sign in or complete OAuth
        if (!pathname.startsWith("/login") && !pathname.startsWith("/auth/callback")) {
          const redirectUrl = request.nextUrl.clone();
          redirectUrl.pathname = "/login";
          redirectUrl.searchParams.set("redirect", pathname);
          redirectUrl.searchParams.set("reason", "session_invalid");
          return NextResponse.redirect(redirectUrl);
        }
      }
    } catch (err) {
      sessionError = err as { message?: string; code?: string };
      const isRefreshTokenNotFound =
        sessionError?.code === "refresh_token_not_found" ||
        sessionError?.message?.includes("refresh_token_not_found");
      const isInvalidOrUsedRefreshToken =
        sessionError &&
        (sessionError.code === "refresh_token_already_used" ||
          sessionError.message?.includes("refresh_token_already_used"));

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

    // If no Supabase session and trying to access protected route
    if (!session && !isPublicRoute) {
      if (process.env.NODE_ENV === "development") {
        console.log("[middleware] No Supabase session, redirecting to login");
      }
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // If Supabase session exists and trying to access login, redirect to dashboard
    if (session && pathname === "/login") {
      console.log("[middleware] Session exists, redirecting from login to dashboard");
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
        if (process.env.NODE_ENV === "development") {
          console.log("[middleware] Session expired:", validity.reason);
        }
        const cookieSetter = {
          set: (name: string, value: string, options: any) => {
            response.cookies.set(name, value, options);
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
      // 1. Middleware runs in Edge Runtime which doesn't support database connections
      // 2. Validation is already done when session is set via set-cookie endpoint
      // 3. If session exists and is valid (time-wise), we trust it was validated during login

      // Session is valid - update last activity time
      const cookieManager = {
        get: (name: string) => request.cookies.get(name),
        set: (name: string, value: string, options: any) => {
          response.cookies.set(name, value, options);
        },
      };
      updateActivity(cookieManager);

      const shouldTrack =
        pathname !== "/api/audit/track" &&
        !pathname.startsWith("/api/audit/track") &&
        !pathname.startsWith("/_next") &&
        !pathname.startsWith("/favicon.ico");

      if (shouldTrack) {
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
            console.error("[middleware] Audit tracking failed:", error);
          }
        });
      }
    }

    return response;
  } catch (error) {
    console.error("[middleware] FATAL ERROR:", error);
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
