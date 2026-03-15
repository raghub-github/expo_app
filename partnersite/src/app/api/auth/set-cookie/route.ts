import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { initializeSession } from "@/lib/auth/session-manager";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import {
  replaceSessionForDevice,
  generateDeviceId,
} from "@/lib/auth/merchant-session-db";
import { deviceIdCookie } from "@/lib/auth/auth-cookie-names";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Production-safe cookie options so cookies work on HTTPS and are sent on same-site requests.
 */
function applyCookieOptions(
  cookieStore: Awaited<ReturnType<typeof import("next/headers").cookies>>,
  response: NextResponse,
  name: string,
  value: string,
  options: Record<string, unknown>
): void {
  const opts = {
    ...options,
    path: (options.path as string) ?? "/",
    httpOnly: options.httpOnly !== false,
    secure: isProduction,
    sameSite: "lax" as const,
  };
  cookieStore.set(name, value, opts as Parameters<typeof cookieStore.set>[2]);
  response.cookies.set(name, value, opts as Parameters<typeof response.cookies.set>[2]);
}

const SET_COOKIE_TIMEOUT_MS = 25_000;

/**
 * POST /api/auth/set-cookie
 * Call after successful login. Validates merchant by id/phone/email (any match).
 * Deactivates any existing session for this device, creates new merchant_sessions row,
 * sets Supabase session and custom session cookies. Never blocks on email mismatch.
 * Used by client callback when hash/token flow is used; primary OAuth flow uses GET /api/auth/callback.
 */
export async function POST(request: NextRequest) {
  const run = async (): Promise<NextResponse> => {
  try {
    console.log("[set-cookie] request start");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
      console.error("[set-cookie] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
      return NextResponse.json(
        { success: false, error: "Server configuration error. Please try again or contact support.", code: "CONFIG_MISSING" },
        { status: 503 }
      );
    }
    if (!serviceRoleKey?.trim()) {
      console.error("[set-cookie] Missing SUPABASE_SERVICE_ROLE_KEY");
      return NextResponse.json(
        { success: false, error: "Server configuration error. Please try again or contact support.", code: "CONFIG_MISSING" },
        { status: 503 }
      );
    }

    let body: { access_token?: string; refresh_token?: string; device_id?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body", code: "INVALID_BODY" },
        { status: 400 }
      );
    }
    const { access_token, refresh_token, device_id: bodyDeviceId } = body ?? {};
    if (!access_token || !refresh_token) {
      return NextResponse.json(
        { success: false, error: "Missing tokens", code: "MISSING_TOKENS" },
        { status: 400 }
      );
    }

    const t0 = Date.now();
    const cookieStore = await cookies();
    const response = NextResponse.json({ success: true });
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              applyCookieOptions(cookieStore, response, name, value, options ?? {});
            });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    const t1 = Date.now();
    console.log("[set-cookie] setSession in", t1 - t0, "ms, error:", error?.message ?? "none");

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    if (!data.session?.user) {
      return NextResponse.json(
        { success: false, error: "No session after setSession", code: "NO_SESSION" },
        { status: 400 }
      );
    }

    let validation: Awaited<ReturnType<typeof validateMerchantFromSession>>;
    try {
      validation = await validateMerchantFromSession(data.session.user);
      console.log("[set-cookie] validate in", Date.now() - t1, "ms, valid:", validation.isValid);
    } catch (validateErr) {
      console.error("[set-cookie] validateMerchantFromSession threw:", validateErr);
      await supabase.auth.signOut().catch(() => {});
      return NextResponse.json(
        { success: false, error: "Unable to verify your account. Please try again.", code: "VALIDATION_ERROR" },
        { status: 500 }
      );
    }
    if (!validation.isValid) {
      await supabase.auth.signOut().catch(() => {});
      return NextResponse.json(
        {
          success: false,
          error: validation.error || "Not authorized for merchant dashboard.",
        },
        { status: 403 }
      );
    }

    const merchantId = validation.merchantParentId!;
    const deviceIdCookieName = deviceIdCookie();
    const cookieDeviceId = cookieStore.get(deviceIdCookieName)?.value?.trim();
    const deviceId = (bodyDeviceId && bodyDeviceId.trim()) || cookieDeviceId || generateDeviceId();

    try {
      await replaceSessionForDevice(deviceId.trim(), merchantId);
    } catch (sessionDbErr) {
      console.error("[set-cookie] merchant_sessions error (table may not exist yet):", sessionDbErr);
    }

    const cookieManager = {
      set: (name: string, value: string, options: Record<string, unknown>) => {
        cookieStore.set(name, value, options as any);
        response.cookies.set(name, value, options as any);
      },
    };
    initializeSession(cookieManager);

    const deviceCookieOpts = {
      maxAge: 365 * 24 * 60 * 60,
      path: "/",
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
    };
    cookieManager.set(deviceIdCookieName, deviceId, deviceCookieOpts);

    console.log("[set-cookie] success in", Date.now() - t0, "ms");
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "set-cookie error";
    console.error("[set-cookie] handler error:", message);
    return NextResponse.json(
      { success: false, error: message, code: "SET_COOKIE_ERROR" },
      { status: 500 }
    );
  }
  };

  const timeoutPromise = new Promise<NextResponse>((resolve) =>
    setTimeout(
      () =>
        resolve(
          NextResponse.json(
            {
              success: false,
              error: "Request took too long. Please try again.",
              code: "TIMEOUT",
            },
            { status: 503 }
          )
        ),
      SET_COOKIE_TIMEOUT_MS
    )
  );
  return Promise.race([run(), timeoutPromise]);
}
