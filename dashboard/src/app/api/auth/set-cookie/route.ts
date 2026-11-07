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
import {
  isCookieAccessTokenUsable,
  readCookieAccessSession,
} from "@/lib/auth/read-cookie-access-session";
import { recordFailedLogin, recordLogin } from "@/lib/auth/user-management";
import { getSystemUserById } from "@/lib/db/operations/users";
import { getIpAddress, getUserAgent } from "@/lib/audit/logger";
import {
  rememberDashboardIdentity,
  DASHBOARD_IDENTITY_EMAIL_COOKIE,
  dashboardIdentityEmailCookieOptions,
} from "@/lib/auth/auth-identity-cache";

export const runtime = "nodejs";

/**
 * nginx gives up on this route at 60s (proxy_read_timeout) and the browser sees
 * a bare 504. Bound each DB step so we always answer first, with a 503 the login
 * page treats as "try again" — never as "not authorized".
 */
const VALIDATE_DEADLINE_MS = 20_000;
const BOOKKEEPING_DEADLINE_MS = 5_000;

function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} request timeout after ${ms}ms`);
      err.name = "TimeoutError";
      reject(err);
    }, ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

function serviceUnavailable() {
  return NextResponse.json(
    {
      success: false,
      error: "Service temporarily unavailable. Please try again in a moment.",
      code: "SERVICE_UNAVAILABLE",
    },
    { status: 503 }
  );
}

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
        const existing = readCookieAccessSession({
          get: (name) => cookieStore.get(name),
          getAll: () => cookieStore.getAll(),
        });
        if (isCookieAccessTokenUsable(existing)) {
          console.warn(
            "[set-cookie] Ignoring stale refresh token; existing cookie session is still valid"
          );
          return NextResponse.json({ success: true, reusedExistingSession: true });
        }
        try {
          const supabase = await createServerSupabaseClient();
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
      const validation = await withDeadline(
        validateUserForLogin(email),
        VALIDATE_DEADLINE_MS,
        "validateUserForLogin"
      );

      // Could not reach the DB: the user was not judged. Signing out here (it used
      // to be a GLOBAL sign-out) logged the admin out of every browser and every
      // GatiMitra site sharing this Supabase project whenever the DB was slow.
      if (validation.transient) {
        console.warn("[set-cookie] Validation unavailable; answering 503:", validation.error);
        return serviceUnavailable();
      }

      if (!validation.isValid) {
        await withDeadline(
          recordFailedLogin(
            email,
            validation.error || "Unauthorized",
            getIpAddress(request),
            getUserAgent(request)
          ),
          BOOKKEEPING_DEADLINE_MS,
          "recordFailedLogin"
        ).catch(() => undefined);

        try {
          const supabase = await createServerSupabaseClient();
          // Only the session this request just created — never every device.
          await supabase.auth.signOut({ scope: "local" });
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
        // Bookkeeping must not hold a valid login hostage to a slow DB. If the
        // lookup misses its deadline the cookie is left unset; /api/auth/bootstrap
        // (called right after login) sets it from permissions.
        const systemUser = await withDeadline(
          getSystemUserById(systemUserId),
          BOOKKEEPING_DEADLINE_MS,
          "getSystemUserById"
        ).catch(() => undefined);
        if (systemUser !== undefined) {
          const canTogglePortal = Boolean(systemUser?.canTogglePortal);
          response.cookies.set("gm_portal_toggle_access", canTogglePortal ? "1" : "0", {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 7,
          });
        }

        await withDeadline(
          recordLogin(systemUserId, provider, getIpAddress(request), getUserAgent(request)),
          BOOKKEEPING_DEADLINE_MS,
          "recordLogin"
        ).catch((err) => console.warn("[set-cookie] recordLogin skipped:", err instanceof Error ? err.message : err));
      }
    }

    return response;
  } catch (e: unknown) {
    if (isTimeoutOrAbortError(e) || isNetworkOrTransientError(e) || isTransientAuthError(e)) {
      return serviceUnavailable();
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
