import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { initializeSession } from "@/lib/auth/session-manager";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
 * validate merchant, then redirect to /auth/post-login. This avoids client-side exchange and
 * ensures cookies are set by the same response that redirects (reliable on new devices).
 *
 * Add to Supabase Redirect URLs: https://partner.gatimitra.com/api/auth/callback and http://localhost:3000/api/auth/callback
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  let next = url.searchParams.get("next") || "/auth/post-login";

  // Ensure next is same-origin path (no open redirect)
  if (next.startsWith("http")) {
    try {
      const nextUrl = new URL(next);
      if (nextUrl.origin !== url.origin) next = "/auth/post-login";
      else next = nextUrl.pathname + nextUrl.search;
    } catch {
      next = "/auth/post-login";
    }
  }
  if (!next.startsWith("/")) next = "/auth/post-login";

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

  const cookieManager = {
    set: (name: string, value: string, options: Record<string, unknown>) => {
      applyCookieOptions(response, name, value, options);
    },
  };
  initializeSession(cookieManager as Parameters<typeof initializeSession>[0]);

  return response;
}
