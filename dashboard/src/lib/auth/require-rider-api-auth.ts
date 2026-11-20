/**
 * Shared Rider dashboard API auth — prefer this over raw getUser() + email-only
 * system_users lookup (session JWT often omits email → false AGENT_NOT_FOUND 403).
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  authFailureResponse,
  getAuthenticatedApiUser,
  type ApiAuthFailure,
} from "@/lib/auth/api-session";
import { resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export type RiderApiAuthSuccess = {
  ok: true;
  user: User;
  email: string;
  systemUserId: number;
};

export type RiderApiAuthResult = RiderApiAuthSuccess | ApiAuthFailure;

export async function requireRiderApiAuth(
  request?: Pick<NextRequest, "signal" | "cookies" | "headers">
): Promise<RiderApiAuthResult> {
  const auth = await getAuthenticatedApiUser(request);
  if (!auth.ok) return auth;

  const { user } = auth;
  let email = (user.email ?? "").trim();
  const mapped = await resolveSystemUserForSupabaseAuth(user.id, email || undefined);
  if (!email) {
    email = (mapped?.email ?? "").trim();
  }
  if (!mapped) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        error: "Your account is not set up as an agent. Please contact admin.",
        code: "AGENT_NOT_FOUND",
      },
    };
  }
  if (!email) {
    return {
      ok: false,
      status: 401,
      body: {
        success: false,
        error: "Not authenticated",
        code: "UNAUTHORIZED",
      },
    };
  }

  const userIsSuperAdmin = await isSuperAdmin(user.id, email);
  const hasRiderAccess = await hasDashboardAccessByAuth(user.id, email, "RIDER");
  if (!userIsSuperAdmin && !hasRiderAccess) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        error: "Insufficient permissions. RIDER dashboard access required.",
        code: "FORBIDDEN",
      },
    };
  }

  return {
    ok: true,
    user: email === user.email ? user : { ...user, email },
    email,
    systemUserId: mapped.id,
  };
}

export function riderAuthFailureResponse(
  failure: Exclude<RiderApiAuthResult, RiderApiAuthSuccess>
): NextResponse {
  if (failure.status === 403) {
    return NextResponse.json(failure.body, { status: 403 });
  }
  return authFailureResponse(failure);
}
