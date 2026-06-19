/**
 * POST /api/auth/set-cookie
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { initializeSession } from "@/lib/auth/session-manager";
import { validateUserForLogin } from "@/lib/auth/user-validation";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";
import { recordFailedLogin, recordLogin } from "@/lib/auth/user-management";
import { getSystemUserById } from "@/lib/db/operations/users";
import { getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { fetchWithTimeout } from "@/lib/supabase/fetch-timeout";

export const runtime = "nodejs";

function normalizeSupabaseCookieOptions(options: any) {
  // Supabase sets `secure` based on request context; in Next dev this can end up true,
  // causing browsers to not send cookies over plain `http://`.
  // Force `secure: false` outside production so Edge middleware/server can read cookies.
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd ? options?.secure : false;

  const sameSiteRaw = options?.sameSite;
  const sameSite =
    sameSiteRaw === "lax" || sameSiteRaw === "strict" || sameSiteRaw === "none" ? sameSiteRaw : undefined;

  return {
    ...options,
    secure,
    sameSite,
    // Ensure a safe default so cookies are sent to all routes.
    path: options?.path ?? "/",
  };
}

export async function POST(request: NextRequest) {
  try {
    // ✅ SAFE BODY PARSING (fixes 502 issue)
    let body: any = null;

    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : null;
    } catch (err) {
      console.error("[set-cookie] JSON parse error:", err);
      return NextResponse.json(
        { success: false, error: "Invalid request body", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const access_token = body?.access_token;
    const refresh_token = body?.refresh_token;

    // ✅ STRICT VALIDATION
    if (!access_token || !refresh_token) {
      console.error("[set-cookie] Missing tokens:", body);
      return NextResponse.json(
        { success: false, error: "Missing tokens", code: "MISSING_TOKENS" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing Supabase environment variables",
          code: "MISSING_SUPABASE_ENV",
        },
        { status: 500 }
      );
    }

    const cookieStore = await cookies();
    const response = NextResponse.json({ success: true });

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      global: {
        fetch: fetchWithTimeout,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const normalized = normalizeSupabaseCookieOptions(options);
            cookieStore.set(name, value, normalized);
            response.cookies.set(name, value, normalized);
          });
        },
      },
    });

    // ✅ SET SESSION
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      if (isInvalidRefreshToken(error)) {
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        return NextResponse.json(
          { success: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 }
        );
      }
      console.error("[set-cookie] Supabase error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    let systemUserId: number | null = null;

    // ✅ USER VALIDATION
    if (data.session?.user?.email) {
      const email = data.session.user.email;

      const validation = await validateUserForLogin(email);

      if (!validation.isValid) {
        await recordFailedLogin(
          email,
          validation.error || "Unauthorized",
          getIpAddress(request),
          getUserAgent(request)
        );

        await supabase.auth.signOut();

        return NextResponse.json(
          {
            success: false,
            error:
              validation.error ||
              "Your account is not authorized to access this portal.",
          },
          { status: 403 }
        );
      }

      systemUserId = validation.systemUserId ?? null;
    }

    // ✅ SESSION INIT
    if (data.session) {
      const cookieManager = {
        set: (name: string, value: string, options: any) => {
          cookieStore.set(name, value, options);
          response.cookies.set(name, value, options);
        },
      };

      initializeSession(cookieManager);

      console.log("[set-cookie] Session initialized");

      if (data.session.user?.email && systemUserId) {
        const provider =
          data.session.user.app_metadata?.provider || "unknown";

        const systemUser = await getSystemUserById(systemUserId);
        const canTogglePortal = Boolean(systemUser?.canTogglePortal);
        response.cookies.set("gm_portal_toggle_access", canTogglePortal ? "1" : "0", {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: 60 * 60 * 24 * 7,
        });

        await recordLogin(
          systemUserId,
          provider,
          getIpAddress(request),
          getUserAgent(request)
        );
      }
    }

    return response;
  } catch (e: any) {
    console.error("[set-cookie] FATAL ERROR:", e);

    return NextResponse.json(
      {
        success: false,
        error: e?.message || "SET_COOKIE_ERROR",
        code: "SET_COOKIE_ERROR",
      },
      { status: 500 }
    );
  }
}