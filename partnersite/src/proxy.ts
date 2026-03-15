import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createSafeFetchWithTimeout } from "@/lib/auth/fetch-with-timeout";
import {
  getSessionMetadata,
  checkSessionValidity,
  updateActivity,
  expireSession,
  initializeSession,
} from "@/lib/auth/session-manager";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { hasActiveSessionForDevice } from "@/lib/auth/merchant-session-db";
import { deviceIdCookie } from "@/lib/auth/auth-cookie-names";

/** Build path + search for redirect param, stripping OAuth code/state so login URL stays clean. */
function redirectPathWithoutOAuthParams(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete("code");
  params.delete("state");
  const q = params.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const response = NextResponse.next();

  // Let these API routes always run; they handle their own auth/errors.
  // Merchant auth lives under /api/merchant-auth/ to avoid being shadowed by NextAuth catch-all at /api/auth/[...nextauth].
  if (
    pathname.startsWith("/api/merchant-auth/") ||
    pathname === "/api/auth/resolve-session" ||
    pathname === "/api/auth/merchant-session" ||
    pathname === "/api/auth/set-cookie"
  ) {
    return response;
  }

  const oauthCode = request.nextUrl.searchParams.get("code");
  if (oauthCode && pathname !== "/auth/callback" && pathname !== "/api/auth/callback") {
    const callbackUrl = new URL("/auth/callback", request.url);
    request.nextUrl.searchParams.forEach((value, key) => callbackUrl.searchParams.set(key, value));
    return NextResponse.redirect(callbackUrl);
  }

  const clearSupabaseCookies = () => {
    const supabaseCookieNames = request.cookies
      .getAll()
      .map((c) => c.name)
      .filter((name) => name.startsWith("sb-"));
    supabaseCookieNames.forEach((name) => {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    });
  };

  try {
    const safeFetch = createSafeFetchWithTimeout(6_000);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { fetch: safeFetch },
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, {
                ...options,
                httpOnly: options.httpOnly !== false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
              });
            });
          },
        },
      }
    );

    const hasAuthCookie =
      request.cookies.has("sb-access-token") ||
      request.cookies.has("sb-refresh-token") ||
      request.cookies.getAll().some((c) => c.name.startsWith("sb-"));

    const publicRoutes = ["/auth", "/api/auth"];
    const isPublicRoute = publicRoutes.some((r) => pathname.startsWith(r));
    const isLoginPage = pathname === "/auth/login" || pathname === "/auth/login-store" || pathname === "/auth/login-store/list";
    const isRegisterPage = pathname === "/auth/register" || pathname.startsWith("/auth/register-");
    const isPublic = isPublicRoute || pathname === "/" || pathname.startsWith("/auth/search");
    const isPostLoginPage = pathname === "/auth/post-login";

    if (pathname.startsWith("/api/") && hasAuthCookie) {
      const cookieWrapper = { get: (name: string) => request.cookies.get(name) ?? undefined };
      const metadata = getSessionMetadata(cookieWrapper);
      if (metadata) {
        const cookieManager = {
          get: (name: string) => request.cookies.get(name) ?? undefined,
          set: (name: string, value: string, options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }) => {
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
          },
        };
        updateActivity(cookieManager);
      }
      return response;
    }

    let session: { user: { id: string; email?: string; phone?: string } } | null = null;
    let sessionError: { message?: string; code?: string } | null = null;

    if (hasAuthCookie) {
      try {
        const timeoutPromise = new Promise<{ data: { user: null }; error: { message: string; code: string } }>((resolve) =>
          setTimeout(() => resolve({ data: { user: null }, error: { message: "Session check timeout", code: "TIMEOUT" } }), 5000)
        );
        const userPromise = supabase.auth.getUser().then((r) => r).catch((err: unknown) => ({
          data: { user: null },
          error: { message: (err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "fetch failed"), code: "NETWORK_ERROR" },
        }));
        const userResult = (await Promise.race([userPromise, timeoutPromise])) as unknown as { data?: { user?: { id: string; email?: string; phone?: string } }; error?: { message?: string; code?: string } };
        const user = userResult.data?.user ?? null;
        sessionError = userResult.error ?? null;
        if (user) session = { user: { id: user.id, email: user.email, phone: user.phone } };
      } catch {
        session = null;
        sessionError = { message: "Session check failed", code: "NETWORK_ERROR" };
      }
    }

    if (sessionError) {
      if (sessionError.code === "TIMEOUT" || sessionError.code === "NETWORK_ERROR") {
        return response;
      }
      if (sessionError.message !== 'Auth session missing!') {
        console.log('[proxy] Session error:', sessionError);
      }
      const isInvalid =
        sessionError.code === "refresh_token_not_found" ||
        sessionError.code === "refresh_token_already_used" ||
        sessionError.code === "invalid_refresh_token" ||
        (sessionError.message ?? "").toLowerCase().includes("invalid refresh token") ||
        (sessionError.message ?? "").toLowerCase().includes("refresh token not found");

      if (isInvalid) {
        console.log('[proxy] Invalid refresh token detected, clearing session');
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.log('[proxy] Error signing out:', signOutError);
        }
        clearSupabaseCookies();

        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { success: false, error: "Session invalid", code: "SESSION_INVALID" },
            { status: 401 }
          );
        }
        if (!isLoginPage && !pathname.startsWith("/auth/register")) {
          const redirectUrl = request.nextUrl.clone();
          redirectUrl.pathname = "/auth/login";
          const fullPath = redirectPathWithoutOAuthParams(pathname, request.nextUrl.search || "");
          redirectUrl.searchParams.set("redirect", fullPath);
          redirectUrl.searchParams.set("reason", "session_invalid");
          return NextResponse.redirect(redirectUrl);
        }
      }
    }

    if (hasAuthCookie && !session) {
      const cookieWrapper = { get: (name: string) => request.cookies.get(name) ?? undefined };
      const metadata = getSessionMetadata(cookieWrapper);
      if (metadata) {
        const cookieManager = {
          get: (name: string) => request.cookies.get(name) ?? undefined,
          set: (name: string, value: string, options: { maxAge: number; path: string }) => {
            response.cookies.set(name, value, options);
          },
        };
        updateActivity(cookieManager);
      }
      return response;
    }

    if (isPostLoginPage && !session) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/auth/login";
      return NextResponse.redirect(redirectUrl);
    }

    const protectedPaths = ["/mx", "/auth/store"];
    const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

    if (!session && isProtected && !isPublic) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
          { status: 401 }
        );
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/auth/login";
      const fullPath = redirectPathWithoutOAuthParams(pathname, request.nextUrl.search || "");
      redirectUrl.searchParams.set("redirect", fullPath);
      return NextResponse.redirect(redirectUrl);
    }

    if (session && (pathname === "/auth/login" || pathname === "/auth/login-store")) {
      return NextResponse.redirect(new URL("/auth/post-login", request.url));
    }

    if (session && isProtected) {
      const deviceId = request.cookies.get(deviceIdCookie())?.value?.trim();
      let deviceSessionValid = false;
      if (deviceId) {
        try {
          const validation = await validateMerchantFromSession({
            id: session.user.id,
            email: session.user.email ?? null,
            phone: session.user.phone ?? null,
          });
          if (validation.isValid && validation.merchantParentId != null) {
            deviceSessionValid = await hasActiveSessionForDevice(validation.merchantParentId, deviceId);
          }
        } catch {
          // treat as invalid
        }
      }
      if (!deviceSessionValid) {
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        clearSupabaseCookies();
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { success: false, error: "Session expired or invalid for this device.", code: "DEVICE_SESSION_INVALID" },
            { status: 401 }
          );
        }
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/auth/login";
        redirectUrl.searchParams.set("redirect", redirectPathWithoutOAuthParams(pathname, request.nextUrl.search || ""));
        redirectUrl.searchParams.set("reason", "device_session_invalid");
        return NextResponse.redirect(redirectUrl);
      }

      const cookieWrapper = { get: (name: string) => request.cookies.get(name) };
      let metadata = getSessionMetadata(cookieWrapper);

      if (!metadata) {
        const cookieSetter = {
          set: (name: string, value: string, options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }) => {
            response.cookies.set(name, value, options as any);
          },
        };
        metadata = initializeSession(cookieSetter);
      }

      const validity = checkSessionValidity(metadata);

      if (!validity.isValid) {
        const cookieSetter = {
          set: (name: string, value: string, options: Record<string, unknown>) => {
            response.cookies.set(name, value, options as any);
          },
        };
        expireSession(cookieSetter);
        await supabase.auth.signOut();
        clearSupabaseCookies();
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { success: false, error: "Session expired", code: "SESSION_EXPIRED" },
            { status: 401 }
          );
        }
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/auth/login";
        redirectUrl.searchParams.set("expired", validity.reason || "unknown");
        const fullPath = redirectPathWithoutOAuthParams(pathname, request.nextUrl.search || "");
        redirectUrl.searchParams.set("redirect", fullPath);
        return NextResponse.redirect(redirectUrl);
      }

      const cookieManager = {
        get: (name: string) => request.cookies.get(name),
        set: (name: string, value: string, options: Record<string, unknown>) => {
          response.cookies.set(name, value, options as any);
        },
      };
      updateActivity(cookieManager);
    }

    return response;
  } catch (error) {
    console.error("[proxy] Error:", error);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
