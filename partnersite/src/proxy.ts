import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createSafeFetchWithTimeout, runWithQuietAuthTimeoutErrors } from "@/lib/auth/fetch-with-timeout";
import {
  getSessionMetadata,
  checkSessionValidity,
  updateActivity,
  expireSession,
  initializeSession,
} from "@/lib/auth/session-manager";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import {
  generateDeviceId,
  hasActiveSessionForDevice,
  replaceSessionForDevice,
} from "@/lib/auth/merchant-session-db";
import { deviceIdCookie } from "@/lib/auth/auth-cookie-names";
import {
  isFatalRefreshTokenError,
  isRefreshTokenAlreadyUsed,
} from "@/lib/auth/session-errors";
import { readCookieAccessSession } from "@/lib/auth/read-cookie-access-session";

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

  // Legacy /auth/login — canonical sign-in URL is /auth.
  if (pathname === "/auth/login" || pathname === "/auth/login/") {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = "/auth";
    return NextResponse.redirect(nextUrl);
  }

  // Legacy login-store flow — redirect to modern auth / store picker.
  if (pathname === "/auth/login-store" || pathname === "/auth/login-store/") {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = "/auth";
    return NextResponse.redirect(nextUrl);
  }
  if (pathname === "/auth/login-store/list" || pathname === "/auth/login-store/list/") {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = "/partners/all-stores";
    return NextResponse.redirect(nextUrl);
  }

  // Permanent route migration: /mx/* → /partners/* (preserve querystring).
  if (pathname === "/mx" || pathname.startsWith("/mx/")) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = pathname.replace(/^\/mx/, "/partners");
    return NextResponse.redirect(nextUrl);
  }

  // Let these API routes always run; they handle their own auth/errors.
  // Merchant auth lives under /api/merchant-auth/ to avoid being shadowed by NextAuth catch-all at /api/auth/[...nextauth].
  // OAuth callback must not call getUser() — that can consume/wipe the PKCE verifier cookie.
  if (
    pathname.startsWith("/api/merchant-auth/") ||
    pathname.startsWith("/api/attachments/proxy") ||
    pathname === "/api/auth/resolve-session" ||
    pathname === "/api/auth/merchant-session" ||
    pathname === "/api/auth/set-cookie" ||
    pathname === "/api/auth/callback" ||
    pathname === "/auth/callback"
  ) {
    return response;
  }

  const oauthCode = request.nextUrl.searchParams.get("code");
  // Never treat API query `code=` as a Supabase OAuth code. Referral preview uses
  // `?code=MX…` and must not be redirected to /api/auth/callback.
  if (
    oauthCode &&
    pathname !== "/auth/callback" &&
    pathname !== "/api/auth/callback" &&
    !pathname.startsWith("/api/")
  ) {
    const callbackUrl = new URL("/auth/callback", request.url);
    request.nextUrl.searchParams.forEach((value, key) => callbackUrl.searchParams.set(key, value));
    return NextResponse.redirect(callbackUrl);
  }

  const clearAuthCookiesOn = (res: NextResponse) => {
    const supabaseCookieNames = request.cookies
      .getAll()
      .map((c) => c.name)
      .filter((name) => name.startsWith("sb-"));
    supabaseCookieNames.forEach((name) => {
      res.cookies.set(name, "", { path: "/", maxAge: 0 });
    });
    expireSession({
      set: (name, value, options) => {
        res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2]);
      },
    });
  };

  /** Redirect AND clear auth cookies on the same response (otherwise clears are lost). */
  const redirectToLogin = (reason: string, redirectPath?: string) => {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth";
    redirectUrl.search = "";
    if (redirectPath) redirectUrl.searchParams.set("redirect", redirectPath);
    redirectUrl.searchParams.set("reason", reason);
    const res = NextResponse.redirect(redirectUrl);
    clearAuthCookiesOn(res);
    return res;
  };

  try {
    return await runWithQuietAuthTimeoutErrors(async () => {
    const safeFetch = createSafeFetchWithTimeout(2_500);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
      {
        global: { fetch: safeFetch },
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
              response.cookies.set(name, value, {
                ...options,
                httpOnly: options.httpOnly !== false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
              });
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

    const publicRoutes = ["/auth", "/api/auth", "/api/onboarding", "/api/referral", "/merchant-ref"];
    const isPublicRoute = publicRoutes.some((r) => pathname.startsWith(r));
    const isLoginPage =
      pathname === "/auth" ||
      pathname === "/auth/login" ||
      pathname === "/auth/login-store" ||
      pathname === "/auth/login-store/list";
    const isRegisterPage = pathname === "/auth/register" || pathname.startsWith("/auth/register-");
    const isPublic = isPublicRoute || pathname === "/" || pathname.startsWith("/auth/search");
    const isAllStoresPage = pathname === "/partners/all-stores" || pathname === "/auth/post-login";

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
    let sessionError: { message?: string; code?: string; status?: number } | null = null;

    if (hasAuthCookie) {
      const cookieSession = readCookieAccessSession({
        get: (name) => request.cookies.get(name),
        getAll: () => request.cookies.getAll(),
      });
      if (cookieSession?.user?.id) {
        session = {
          user: {
            id: cookieSession.user.id,
            email: cookieSession.user.email,
            phone: cookieSession.user.phone,
          },
        };
      } else {
        try {
          const userResult = (await supabase.auth.getUser().catch((err: unknown) => ({
            data: { user: null },
            error: {
              message:
                err && typeof err === "object" && "message" in err
                  ? String((err as { message: unknown }).message)
                  : "fetch failed",
              code: "NETWORK_ERROR",
            },
          }))) as unknown as {
            data?: { user?: { id: string; email?: string; phone?: string } | null };
            error?: { message?: string; code?: string; status?: number };
          };
          const user = userResult.data?.user ?? null;
          sessionError = userResult.error ?? null;
          if (
            sessionError &&
            (sessionError.status === 408 ||
              /timeout|abort|request_timeout/i.test(String(sessionError.message ?? "")))
          ) {
            sessionError = { message: "Session check timeout", code: "TIMEOUT" };
          }
          if (user) session = { user: { id: user.id, email: user.email, phone: user.phone } };
        } catch {
          session = null;
          sessionError = { message: "Session check failed", code: "NETWORK_ERROR" };
        }
      }
    }

    if (sessionError) {
      if (sessionError.code === "TIMEOUT" || sessionError.code === "NETWORK_ERROR") {
        return response;
      }
      // Concurrent refresh race: another request already rotated the token.
      // Do not clear cookies — the winning response will have set the new ones.
      if (isRefreshTokenAlreadyUsed(sessionError)) {
        if (process.env.NEXT_PUBLIC_DEBUG_PROXY === "true") {
          console.log("[proxy] Refresh token already used (race) — fail open");
        }
        return response;
      }
      if (
        process.env.NEXT_PUBLIC_DEBUG_PROXY === "true" &&
        sessionError.message !== "Auth session missing!"
      ) {
        console.log("[proxy] Session error:", sessionError);
      }

      if (isFatalRefreshTokenError(sessionError)) {
        if (process.env.NEXT_PUBLIC_DEBUG_PROXY === "true") {
          console.log("[proxy] Fatal refresh token error — clearing this browser cookies only");
        }
        // Do NOT call supabase.auth.signOut() — it can revoke refresh for other tabs/devices.
        if (pathname.startsWith("/api/")) {
          const res = NextResponse.json(
            { success: false, error: "Session invalid", code: "SESSION_INVALID" },
            { status: 401 }
          );
          clearAuthCookiesOn(res);
          return res;
        }
        if (!isLoginPage && !pathname.startsWith("/auth/register")) {
          return redirectToLogin(
            "session_invalid",
            redirectPathWithoutOAuthParams(pathname, request.nextUrl.search || "")
          );
        }
        // Child onboarding reload must keep cookies. getUser() races during compile
        // used to wipe a live session here and bounce the merchant to login.
        return response;
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

    if (isAllStoresPage && !session) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/auth";
      return NextResponse.redirect(redirectUrl);
    }

    const protectedPaths = ["/mx", "/auth/store", "/partners"];
    const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

    if (!session && isProtected && !isPublic) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
          { status: 401 }
        );
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/auth";
      const fullPath = redirectPathWithoutOAuthParams(pathname, request.nextUrl.search || "");
      redirectUrl.searchParams.set("redirect", fullPath);
      return NextResponse.redirect(redirectUrl);
    }

    // Authenticated users must never land on sign-in / signup entry pages.
    // Keep onboarding routes (/auth/register-store, resubmit-onboarding, callback) accessible.
    // Exception: forced logout reasons — stay on login even if sb-* cookies briefly remain,
    // otherwise login ↔ all-stores redirect loops (ERR_TOO_MANY_REDIRECTS).
    if (session) {
      const pathNorm = pathname.replace(/\/$/, "") || "/";
      const authEntryPaths = new Set([
        "/auth",
        "/auth/login",
        "/auth/login-store",
        "/auth/login-store/list",
        "/auth/register",
        "/auth/register-phone",
        "/auth/register-parent",
        "/auth/register-business",
        "/auth/search",
      ]);
      if (authEntryPaths.has(pathNorm)) {
        const reason = (request.nextUrl.searchParams.get("reason") ?? "").trim().toLowerCase();
        const forcedLogout =
          reason === "device_session_invalid" ||
          reason === "session_invalid" ||
          reason === "session_expired";

        if (forcedLogout) {
          // Stay on login and clear cookies on THIS response so the loop stops.
          clearAuthCookiesOn(response);
          return response;
        }

        // Mid parent registration: Supabase session exists but merchant_parents row not created yet.
        if (pathNorm === "/auth/register") {
          try {
            const validation = await validateMerchantFromSession({
              id: session.user.id,
              email: session.user.email ?? null,
              phone: session.user.phone ?? null,
            });
            if (!validation.isValid && validation.merchantParentId == null) {
              return response;
            }
          } catch {
            return response;
          }
        }

        return NextResponse.redirect(new URL("/partners/all-stores", request.url));
      }
    }

    if (session && isProtected) {
      const deviceCookieName = deviceIdCookie();
      const deviceIdFromCookie = request.cookies.get(deviceCookieName)?.value?.trim();
      const deviceId = deviceIdFromCookie || generateDeviceId();
      let deviceSessionValid = false;
      try {
        const validation = await validateMerchantFromSession({
          id: session.user.id,
          email: session.user.email ?? null,
          phone: session.user.phone ?? null,
        });
        if (validation.isValid && validation.merchantParentId != null) {
          deviceSessionValid = await hasActiveSessionForDevice(validation.merchantParentId, deviceId);

          // Self-heal: if missing (new device / cleared DB row), create it instead of bouncing back to login.
          if (!deviceSessionValid) {
            try {
              await replaceSessionForDevice(deviceId, validation.merchantParentId, {
                loginMethod: "self_heal",
                deviceLabel: "Restored session",
              });
              deviceSessionValid = true;
            } catch {
              // Transient insert failure (e.g. read-lag on the unique-violation
              // recovery for a row the OAuth callback just wrote). The Supabase
              // session is valid and the merchant is confirmed — fail OPEN so we
              // don't log a freshly-authenticated user out over bookkeeping.
              deviceSessionValid = true;
            }
          }
        }
        // validation.isValid === false is an AFFIRMATIVE authorization decision
        // (not a merchant / blocked) → keep deviceSessionValid false so we bounce.
      } catch {
        // validateMerchantFromSession threw (transient DB/network — its own
        // helpers normally return isValid:false rather than throw). A thrown
        // error is never an authorization decision, so fail OPEN for the
        // already-authenticated session rather than bouncing.
        deviceSessionValid = true;
      }

      // Ensure device id cookie exists for subsequent requests.
      if (!deviceIdFromCookie) {
        response.cookies.set(deviceCookieName, deviceId, {
          maxAge: 365 * 24 * 60 * 60,
          path: "/",
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
        });
      }
      if (!deviceSessionValid) {
        // Account blocked / device row revoked — clear this browser only (no global signOut).
        // Cookie clears MUST be on the returned response (redirect/JSON), not on `response`.
        if (pathname.startsWith("/api/")) {
          const res = NextResponse.json(
            { success: false, error: "Session expired or invalid for this device.", code: "DEVICE_SESSION_INVALID" },
            { status: 401 }
          );
          clearAuthCookiesOn(res);
          return res;
        }
        return redirectToLogin(
          "device_session_invalid",
          redirectPathWithoutOAuthParams(pathname, request.nextUrl.search || "")
        );
      }

      const cookieWrapper = { get: (name: string) => request.cookies.get(name) };
      let metadata = getSessionMetadata(cookieWrapper);

      const cookieSetter = {
        set: (
          name: string,
          value: string,
          options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }
        ) => {
          response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
        },
      };

      if (!metadata) {
        // Supabase session is valid — restore partner_* cookies instead of bouncing to login.
        metadata = initializeSession(cookieSetter);
      } else {
        const validity = checkSessionValidity(metadata);
        if (!validity.isValid) {
          // Soft partner_* expiry while Supabase refresh is still valid: re-init, do not logout.
          metadata = initializeSession(cookieSetter);
        }
      }

      const cookieManager = {
        get: (name: string) => request.cookies.get(name),
        set: (
          name: string,
          value: string,
          options: { maxAge: number; path: string; httpOnly?: boolean; sameSite?: string; secure?: boolean }
        ) => {
          response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
        },
      };
      updateActivity(cookieManager);
    }

    return response;
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "__isAuthError" in error &&
      ((error as { status?: number }).status === 408 ||
        (error as { status?: number }).status === 0)
    ) {
      return response;
    }
    console.error("[proxy] Error:", error);
    return response;
  }
}
