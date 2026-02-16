import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getSessionMetadata,
  checkSessionValidity,
  updateActivity,
  expireSession,
} from "@/lib/auth/session-manager";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const response = NextResponse.next();
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
          autoRefreshToken: false,
          persistSession: true,
          detectSessionInUrl: false,
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

    if (pathname.startsWith("/api/") && hasAuthCookie) {
      const cookieWrapper = { get: (name: string) => request.cookies.get(name) ?? undefined };
      const metadata = getSessionMetadata(cookieWrapper);
      if (metadata) {
        const cookieManager = {
          get: (name: string) => request.cookies.get(name) ?? undefined,
          set: (name: string, value: string, options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }) => {
            response.cookies.set(name, value, options);
          },
        };
        updateActivity(cookieManager);
      }
      return response;
    }

    let session: { user: { id: string; email?: string } } | null = null;
    let sessionError: { message?: string; code?: string } | null = null;

    if (hasAuthCookie) {
      try {
        const userResult = (await Promise.race([
          supabase.auth.getUser(),
          new Promise<{ data: { user: null }; error: { message: string; code: string } }>((resolve) =>
            setTimeout(() => resolve({ data: { user: null }, error: { message: "Session check timeout", code: "TIMEOUT" } }), 3000)
          ),
        ])) as { data?: { user?: { id: string; email?: string } }; error?: { message?: string; code?: string } };
        const user = userResult.data?.user ?? null;
        sessionError = userResult.error ?? null;
        if (user) session = { user: { id: user.id, email: user.email } };
      } catch {
        session = null;
        sessionError = null;
      }
    }

    if (sessionError) {
      const isInvalid =
        sessionError.code === "refresh_token_not_found" ||
        sessionError.code === "refresh_token_already_used" ||
        (sessionError.message ?? "").toLowerCase().includes("invalid refresh token");
      if (isInvalid) {
        try {
          await supabase.auth.signOut();
        } catch {}
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
          redirectUrl.searchParams.set("redirect", pathname);
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

    const protectedPaths = ["/mx", "/admin", "/auth/store"];
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
      redirectUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(redirectUrl);
    }

    if (session && (pathname === "/auth/login" || pathname === "/auth/login-store")) {
      return NextResponse.redirect(new URL("/auth/post-login", request.url));
    }

    if (session && isProtected) {
      const cookieWrapper = { get: (name: string) => request.cookies.get(name) };
      const metadata = getSessionMetadata(cookieWrapper);
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
    console.error("[middleware] Error:", error);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
