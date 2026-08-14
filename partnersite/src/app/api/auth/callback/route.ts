import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { initializeSession } from "@/lib/auth/session-manager";
import { deviceIdCookie } from "@/lib/auth/auth-cookie-names";
import { generateDeviceId, replaceSessionForDevice, clientIpFromRequest, deviceLabelFromUserAgent } from "@/lib/auth/merchant-session-db";
import {
  getPartnerAuthRedirectOriginFromRequest,
  safeSameOriginPath,
} from "@/lib/auth/auth-redirect-url";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

const isProduction = process.env.NODE_ENV === "production";

// The 0.0.0.0 -> localhost mapping this file used to do locally now lives in
// sanitizeAuthOrigin() inside lib/auth/auth-redirect-url.ts, which
// getPartnerAuthRedirectOriginFromRequest() already applies to `origin` below.

/**
 * Production-safe cookie options so cookies work on HTTPS and are sent on same-site requests.
 */
function applyCookieOptions(
  response: NextResponse,
  name: string,
  value: string,
  options: Record<string, unknown>
): void {
  response.cookies.set(name, value, {
    ...options,
    path: (options.path as string) ?? "/",
    httpOnly: options.httpOnly !== false,
    secure: isProduction,
    sameSite: "lax",
  });
}

/**
 * Retarget the SAME response (keeping its Set-Cookie mutations) at a new location, instead
 * of returning a fresh NextResponse.redirect that would drop those cookie changes. Critical
 * on error paths: the session-clear from signOut() must reach the browser.
 */
function redirectVia(response: NextResponse, target: URL): NextResponse {
  response.headers.set("Location", target.toString());
  return response;
}

/**
 * Wipe every Supabase auth cookie (session token + PKCE code-verifier, including chunked
 * `.0`/`.1` variants) from the browser on a failed attempt. Without this, a leftover/half-
 * consumed code verifier collides with the next sign-in and Supabase throws
 * "invalid flow state, no valid flow state found" on the retry.
 */
function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse): void {
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("sb-")) {
      response.cookies.set(c.name, "", { path: "/", maxAge: 0 });
    }
  }
}

/**
 * GET /api/auth/callback?code=...&next=...
 *
 * Server-side OAuth callback: exchange code for session, set cookies on the redirect response,
 * validate merchant, then redirect to /partners/all-stores. This avoids client-side exchange and
 * ensures cookies are set by the same response that redirects (reliable on new devices).
 *
 * NOTE: this API route is reached via the /auth/callback PAGE forwarder, not directly from
 * Supabase. The Supabase OAuth redirect (and the allowlist) targets /auth/callback, which
 * matches the dashboard convention; the page then forwards the code here.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = getPartnerAuthRedirectOriginFromRequest(request.url, request.headers);
  const code = url.searchParams.get("code");
  const next = safeSameOriginPath(url.searchParams.get("next"), origin);

  if (!code) {
    console.warn("[auth/callback] GET called without code");
    return NextResponse.redirect(new URL("/auth?error=missing_code", origin));
  }

  const redirectUrl = new URL(next, origin);
  const response = NextResponse.redirect(redirectUrl);

  const cookieStore = {
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        applyCookieOptions(response, name, value, options);
      });
    },
  };

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: cookieStore,
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession error:", error.message);
    // Wipe stale flow state so an immediate retry (no page refresh) starts clean.
    clearSupabaseAuthCookies(request, response);
    return redirectVia(response, new URL(`/auth?error=${encodeURIComponent(error.message)}`, origin));
  }

  if (!data.session?.user) {
    console.warn("[auth/callback] No session after exchange");
    clearSupabaseAuthCookies(request, response);
    return redirectVia(response, new URL("/auth?error=no_session", origin));
  }

  const validation = await validateMerchantFromSession(data.session.user);
  if (!validation.isValid) {
    // signOut() revokes the just-created session AND clears its cookies — but only on THIS
    // `response`. Returning it (not a fresh redirect) is what makes the clear reach the
    // browser; otherwise the leftover session + code-verifier break the next sign-in with
    // "invalid flow state". Also wipe any verifier chunks explicitly.
    await supabase.auth.signOut();
    clearSupabaseAuthCookies(request, response);
    console.warn("[auth/callback] Merchant validation failed:", validation.error);
    return redirectVia(
      response,
      new URL(
        `/auth?error=${encodeURIComponent(validation.error ?? "Not authorized for merchant dashboard")}`,
        origin
      )
    );
  }

  // Create/refresh the per-device session record used by middleware (`reason=device_session_invalid`).
  // OAuth callback sets Supabase auth cookies, but we also need a stable device id + a row in merchant_sessions.
  try {
    const deviceCookieName = deviceIdCookie();
    const existingDeviceId = request.cookies.get(deviceCookieName)?.value?.trim();
    const deviceId = existingDeviceId || generateDeviceId();

    if (validation.merchantParentId != null) {
      const ua = request.headers.get("user-agent");
      await replaceSessionForDevice(deviceId, validation.merchantParentId, {
        userAgent: ua,
        ipAddress: clientIpFromRequest(request.headers),
        deviceLabel: deviceLabelFromUserAgent(ua),
        loginMethod: "google",
      });
    }

    // Persist device id for future requests (httpOnly, lax).
    applyCookieOptions(response, deviceCookieName, deviceId, {
      maxAge: 365 * 24 * 60 * 60,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
    });
  } catch (e) {
    // Do not block login if DB is temporarily unavailable; middleware DB check is fail-open on errors.
    console.warn("[auth/callback] device session init failed:", e);
  }

  const cookieManager = {
    set: (name: string, value: string, options: Record<string, unknown>) => {
      applyCookieOptions(response, name, value, options);
    },
  };
  initializeSession(cookieManager as Parameters<typeof initializeSession>[0]);

  return response;
}
