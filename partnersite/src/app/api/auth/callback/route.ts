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
 * GET /api/auth/callback?code=...&next=...
 *
 * Server-side OAuth callback: exchange code for session, set cookies on the redirect response,
 * validate merchant, then redirect to /partners/all-stores. This avoids client-side exchange and
 * ensures cookies are set by the same response that redirects (reliable on new devices).
 *
 * Add to Supabase Redirect URLs: https://partner.gatimitra.com/api/auth/callback and http://localhost:3002/api/auth/callback
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
    return NextResponse.redirect(
      new URL(`/auth?error=${encodeURIComponent(error.message)}`, origin)
    );
  }

  if (!data.session?.user) {
    console.warn("[auth/callback] No session after exchange");
    return NextResponse.redirect(new URL("/auth?error=no_session", origin));
  }

  const validation = await validateMerchantFromSession(data.session.user);
  if (!validation.isValid) {
    await supabase.auth.signOut();
    console.warn("[auth/callback] Merchant validation failed:", validation.error);
    return NextResponse.redirect(
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
