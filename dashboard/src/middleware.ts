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
    // Note: Disable autoRefreshToken in middleware to avoid Edge Runtime fetch failures
    // Token refresh should happen in Server Components/API routes, not middleware
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
          autoRefreshToken: false, // Disabled in middleware to prevent Edge Runtime fetch failures
          persistSession: true,
          detectSessionInUrl: false, // Middleware doesn't handle OAuth redirects
        },
      }
    );

    // Get current Supabase session (suppress expected errors, handle invalid token)
    // First check if auth cookies exist to avoid unnecessary network calls
    const hasAuthCookie = request.cookies.has("sb-access-token") || 
                          request.cookies.has("sb-refresh-token") ||
                          request.cookies.getAll().some(c => c.name.startsWith("sb-"));
    
    let session = null;
    let sessionError: { message?: string; code?: string } | null = null;
    
    // Only call getSession if we have auth cookies (avoids network calls when no session exists)
    if (hasAuthCookie) {
      try {
        // Temporarily suppress console.error to prevent Supabase internal fetch errors from polluting logs
        // These errors are expected in Edge Runtime when tokens are invalid/expired and are handled gracefully
        const originalConsoleError = console.error;
        let errorSuppressed = false;
        console.error = (...args: any[]) => {
          const errorStr = String(args[0] || '');
          const fullErrorStr = args.map(a => String(a)).join(' ');
          // Suppress known Supabase fetch errors in Edge Runtime (these are handled gracefully below)
          if ((errorStr.includes('fetch failed') || fullErrorStr.includes('fetch failed')) && 
              (fullErrorStr.includes('SupabaseAuthClient') || 
               fullErrorStr.includes('_refreshAccessToken') ||
               fullErrorStr.includes('_callRefreshToken') ||
               fullErrorStr.includes('__loadSession') ||
               fullErrorStr.includes('_useSession') ||
               fullErrorStr.includes('_emitInitialSession') ||
               fullErrorStr.includes('context.fetch'))) {
            errorSuppressed = true;
            return; // Suppress this specific error
          }
          // Allow all other errors through
          originalConsoleError.apply(console, args);
        };

        try {
          // Wrap getSession in a promise that catches all errors, including internal Supabase errors
          const getSessionPromise = supabase.auth.getSession().catch((err: any) => {
            // Catch and suppress fetch errors from Supabase's internal token refresh attempts
            const errorMsg = String(err?.message || err || '');
            if (errorMsg.includes('fetch failed') || err?.name === 'TypeError') {
              // Return a safe error response instead of throwing
              return { data: { session: null }, error: { message: "Session check failed", code: "FETCH_ERROR" } };
            }
            // Re-throw other errors
            throw err;
          });

          // Use getSession with a timeout to prevent hanging on network failures
          const sessionResult = await Promise.race([
            getSessionPromise,
            new Promise<{ data: { session: null }; error: { message: string; code: string } }>((resolve) =>
              setTimeout(() => resolve({ data: { session: null }, error: { message: "Session check timeout", code: "TIMEOUT" } }), 3000)
            ),
          ]) as { data?: { session: any }; error?: any };
          session = sessionResult.data?.session || null;
          sessionError = sessionResult.error as { message?: string; code?: string } | null;
          
          // If fetch failed (Edge Runtime network issue), treat as no session
          if (sessionError && (sessionError.message?.includes("fetch failed") || sessionError.code === "TIMEOUT" || sessionError.code === "FETCH_ERROR")) {
            if (process.env.NODE_ENV === "development" && !errorSuppressed) {
              console.log("[middleware] Session check failed (network/timeout), treating as no session");
            }
            session = null;
            sessionError = null;
          }
        } finally {
          // Always restore original console.error
          console.error = originalConsoleError;
        }
      } catch (err) {
        // Handle Edge Runtime fetch failures gracefully
        const error = err as { message?: string; code?: string; name?: string };
        const isFetchError = 
          error.name === "TypeError" ||
          error.message?.includes("fetch failed") ||
          error.message?.includes("network") ||
          error.code === "ECONNREFUSED";
        
        if (isFetchError) {
          // Network/fetch failure - treat as no session
          if (process.env.NODE_ENV === "development") {
            console.log("[middleware] Fetch error during session check (network issue), treating as no session");
          }
          session = null;
          sessionError = null;
        } else {
          // Other errors - store for token validation below
          sessionError = error;
        }
      }
    } else {
      // No auth cookies = no session, skip network call entirely
      session = null;
    }

    // Check for token errors (refresh token not found, invalid, etc.)
    if (sessionError) {
      const isRefreshTokenNotFound =
        sessionError.code === "refresh_token_not_found" ||
        sessionError.message?.includes("refresh_token_not_found");
      const isInvalidOrUsedRefreshToken =
        sessionError.code === "refresh_token_already_used" ||
        sessionError.message?.includes("refresh_token_already_used") ||
        sessionError.message?.toLowerCase().includes("invalid refresh token");

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
