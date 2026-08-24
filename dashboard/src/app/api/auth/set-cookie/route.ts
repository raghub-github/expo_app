/**
 * POST /api/auth/set-cookie
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { initializeSession } from "@/lib/auth/session-manager";
import { validateUserForLogin } from "@/lib/auth/user-validation";
import {
  isTransientAuthError,
  isTimeoutOrAbortError,
  isNetworkOrTransientError,
  signOutIfSessionDead,
} from "@/lib/auth/session-errors";
import { validateAndPersistSupabaseSession } from "@/lib/auth/persist-supabase-session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordFailedLogin, recordLogin } from "@/lib/auth/user-management";
import { getSystemUserById } from "@/lib/db/operations/users";
import { getIpAddress, getUserAgent } from "@/lib/audit/logger";
import {
  rememberDashboardIdentity,
  DASHBOARD_IDENTITY_EMAIL_COOKIE,
  dashboardIdentityEmailCookieOptions,
} from "@/lib/auth/auth-identity-cache";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: { access_token?: string; refresh_token?: string } | null = null;

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

    const access_token =
      typeof body?.access_token === "string" ? body.access_token.trim() : "";
    const refresh_token =
      typeof body?.refresh_token === "string" ? body.refresh_token.trim() : "";

    if (!access_token || !refresh_token) {
      console.error("[set-cookie] Missing tokens:", body);
      return NextResponse.json(
        { success: false, error: "Missing tokens", code: "MISSING_TOKENS" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const response = NextResponse.json({ success: true });

    const persist = await validateAndPersistSupabaseSession({
      accessToken: access_token,
      refreshToken: refresh_token,
      signal: request.signal,
      cookies: {
        getAll: () => cookieStore.getAll(),
        set: (name, value, options) => {
          cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);
          response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
        },
      },
    });

    if (!persist.ok) {
      if (persist.code === "SESSION_INVALID") {
        try {
          const supabase = await createServerSupabaseClient();
          const existing = await supabase.auth.getUser();
          if (existing.data?.user && !existing.error) {
            console.warn(
              "[set-cookie] Ignoring stale refresh token; existing cookie session is still valid"
            );
            return NextResponse.json({ success: true, reusedExistingSession: true });
          }
          await signOutIfSessionDead(supabase, new Error("Session invalid"));
        } catch {
          // fall through
        }
      }
      console.error("[set-cookie] Persist failed:", persist.error);
      return NextResponse.json(
        { success: false, error: persist.error, code: persist.code },
        { status: persist.status }
      );
    }

    const data = { session: persist.session };
    let systemUserId: number | null = null;

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

        try {
          const supabase = await createServerSupabaseClient();
          await supabase.auth.signOut();
        } catch {
          // ignore
        }

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
      const authId = data.session.user?.id;
      if (authId && systemUserId) {
        rememberDashboardIdentity(authId, {
          email,
          systemUserNumericId: systemUserId,
          primaryRole: validation.primaryRole || "",
        });
        response.cookies.set(
          DASHBOARD_IDENTITY_EMAIL_COOKIE,
          email.trim().toLowerCase(),
          dashboardIdentityEmailCookieOptions()
        );
      }
    }

    if (data.session) {
      const cookieManager = {
        set: (name: string, value: string, options: Record<string, unknown>) => {
          cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);
          response.cookies.set(
            name,
            value,
            options as Parameters<typeof response.cookies.set>[2]
          );
        },
      };

      initializeSession(cookieManager);
      console.log("[set-cookie] Session initialized");

      if (data.session.user?.email && systemUserId) {
        const provider = data.session.user.app_metadata?.provider || "unknown";
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
    if (isTimeoutOrAbortError(e) || isNetworkOrTransientError(e) || isTransientAuthError(e)) {
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
