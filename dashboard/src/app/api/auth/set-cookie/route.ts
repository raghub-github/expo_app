/**
 * POST /api/auth/set-cookie
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { initializeSession } from "@/lib/auth/session-manager";
import { validateUserForLogin } from "@/lib/auth/user-validation";
import { isInvalidRefreshToken, isNetworkOrTransientError, isTimeoutOrAbortError } from "@/lib/auth/session-errors";
import { isTransientAuthError } from "@/lib/auth/api-session";
import { recordFailedLogin, recordLogin } from "@/lib/auth/user-management";
import { getSystemUserById } from "@/lib/db/operations/users";
import { getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { fetchWithTimeout } from "@/lib/supabase/fetch-timeout";

export const runtime = "nodejs";

const maxSetSessionAttempts = 3;
const retryDelaysMs = [800, 1600];

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

    // ✅ SET SESSION (retry transient Supabase/network failures)
    let data: Awaited<ReturnType<typeof supabase.auth.setSession>>["data"] | null = null;
    let sessionError: unknown = null;

    for (let attempt = 1; attempt <= maxSetSessionAttempts; attempt++) {
      if (request.signal.aborted) {
        return NextResponse.json(
          { success: false, error: "Request aborted", code: "REQUEST_ABORTED" },
          { status: 499 }
        );
      }

      try {
        const result = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        data = result.data;
        sessionError = result.error ?? null;
      } catch (err) {
        data = null;
        sessionError = err;
      }

      if (!sessionError && data?.session) break;
      if (sessionError && isInvalidRefreshToken(sessionError)) break;
      if (sessionError && isTransientAuthError(sessionError) && attempt < maxSetSessionAttempts) {
        const delay = retryDelaysMs[attempt - 1] ?? 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      break;
    }

    if (sessionError || !data?.session) {
      if (sessionError && isInvalidRefreshToken(sessionError)) {
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
      if (sessionError && isTransientAuthError(sessionError)) {
        return NextResponse.json(
          {
            success: false,
            error: "Service temporarily unavailable",
            code: "SERVICE_UNAVAILABLE",
          },
          { status: 503 }
        );
      }
      const message =
        sessionError instanceof Error
          ? sessionError.message
          : typeof sessionError === "object" &&
              sessionError != null &&
              "message" in sessionError &&
              typeof (sessionError as { message?: unknown }).message === "string"
            ? (sessionError as { message: string }).message
            : "Failed to set session";
      console.error("[set-cookie] Supabase error:", sessionError);
      return NextResponse.json(
        { success: false, error: message, code: "SET_SESSION_FAILED" },
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
  } catch (e: unknown) {
    if (isTimeoutOrAbortError(e) || isNetworkOrTransientError(e)) {
      return NextResponse.json(
        {
          success: false,
          error: "Service temporarily unavailable",
          code: "SERVICE_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
    console.error("[set-cookie] FATAL ERROR:", e);

    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "SET_COOKIE_ERROR",
        code: "SET_COOKIE_ERROR",
      },
      { status: 500 }
    );
  }
}