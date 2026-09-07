import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getSessionMetadata,
  checkSessionValidity,
  updateActivity,
  initializeSession,
  expireSession,
  isMeaningfulActivityRequest,
} from "@/lib/auth/session-manager";
import { isTimeoutOrAbortError } from "@/lib/auth/session-errors";
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

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const normalizedRedirectPath = pathname === "/" ? "/dashboard" : pathname;
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

    // sb-* cookies present. Authenticate from the cookie JWT only.
    // Never call Auth getUser() — expired/rotated refresh tokens log
    // AuthApiError: refresh_token_not_found in the terminal, and API routes
    // already authenticate via resolveSupabaseUser (cookie-first).
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

    // No sb-* cookies — do not call Auth getUser() (that refreshes leftover
    // tokens and logs refresh_token_not_found). Treat as signed-out.
    const publicRoutes = [
      "/login",
      "/auth",
      "/api/auth",
      "/api/health",
      "/api/onboarding",
    ];
    const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

    if (!isPublicRoute) {
      if (debugProxy) {
        console.log("[proxy] No Supabase session, redirecting to login");
      }
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      return unauthenticatedLoginRedirect(request, pathname);
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
