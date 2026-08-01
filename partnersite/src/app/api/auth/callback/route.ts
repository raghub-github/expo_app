import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { initializeSession } from "@/lib/auth/session-manager";
import { deviceIdCookie } from "@/lib/auth/auth-cookie-names";
import { generateDeviceId, replaceSessionForDevice, clientIpFromRequest, deviceLabelFromUserAgent } from "@/lib/auth/merchant-session-db";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

const isProduction = process.env.NODE_ENV === "production";

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
  const code = url.searchParams.get("code");
  let next = url.searchParams.get("next") || "/partners/all-stores";

  // Ensure next is same-origin path (no open redirect)
  if (next.startsWith("http")) {
    try {
      const nextUrl = new URL(next);
      if (nextUrl.origin !== url.origin) next = "/partners/all-stores";
      else next = nextUrl.pathname + nextUrl.search;
    } catch {
      next = "/partners/all-stores";
    }
  }
  if (!next.startsWith("/")) next = "/partners/all-stores";

  if (!code) {
    console.warn("[auth/callback] GET called without code");
    return NextResponse.redirect(new URL("/auth/login?error=missing_code", url.origin));
  }

  const redirectUrl = new URL(next, url.origin);
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
      new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, url.origin)
    );
  }

  if (!data.session?.user) {
    console.warn("[auth/callback] No session after exchange");
    return NextResponse.redirect(new URL("/auth/login?error=no_session", url.origin));
  }

  const validation = await validateMerchantFromSession(data.session.user);
  if (!validation.isValid) {
    await supabase.auth.signOut();
    console.warn("[auth/callback] Merchant validation failed:", validation.error);
    return NextResponse.redirect(
      new URL(
        `/auth/login?error=${encodeURIComponent(validation.error ?? "Not authorized for merchant dashboard")}`,
        url.origin
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
