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
 * POST /api/merchant-auth/set-cookie
 * Call after successful login. Validates merchant, creates device session, sets cookies.
 * Used by auth callback; client must send device_id in body (from getOrCreateDeviceId()).
 */
export async function POST(request: NextRequest) {
  const run = async (): Promise<NextResponse> => {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
        return NextResponse.json(
          { success: false, error: "Server configuration error.", code: "CONFIG_MISSING" },
          { status: 503 }
        );
      }
      if (!serviceRoleKey?.trim()) {
        return NextResponse.json(
          { success: false, error: "Server configuration error.", code: "CONFIG_MISSING" },
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

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }

      if (!data.session?.user) {
        return NextResponse.json(
          { success: false, error: "No session after setSession", code: "NO_SESSION" },
          { status: 400 }
        );
      }

      const validation = await validateMerchantFromSession(data.session.user);
      if (!validation.isValid) {
        await supabase.auth.signOut().catch(() => {});
        return NextResponse.json(
          { success: false, error: validation.error || "Not authorized.", code: "FORBIDDEN" },
          { status: 403 }
        );
      }

      const merchantId = validation.merchantParentId!;
      const deviceIdCookieName = deviceIdCookie();
      const cookieDeviceId = cookieStore.get(deviceIdCookieName)?.value?.trim();
      const deviceId = (bodyDeviceId && String(bodyDeviceId).trim()) || cookieDeviceId || generateDeviceId();

      try {
        await replaceSessionForDevice(deviceId.trim(), merchantId);
      } catch (sessionDbErr) {
        console.error("[merchant-auth/set-cookie] merchant_sessions error:", sessionDbErr);
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
        secure: isProduction,
      };
      cookieManager.set(deviceIdCookieName, deviceId, deviceCookieOpts);

      return response;
    } catch (e) {
      const message = e instanceof Error ? e.message : "set-cookie error";
      console.error("[merchant-auth/set-cookie] error:", message);
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
            { success: false, error: "Request took too long.", code: "TIMEOUT" },
            { status: 503 }
          )
        ),
      SET_COOKIE_TIMEOUT_MS
    )
  );
  return Promise.race([run(), timeoutPromise]);
}
