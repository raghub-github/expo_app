/**
 * Shared Order Details API auth — always use this instead of raw getUser().
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  authFailureResponse,
  getAuthenticatedApiUser,
  type ApiAuthFailure,
} from "@/lib/auth/api-session";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export type OrderApiAuthSuccess = {
  ok: true;
  user: User;
};

export type OrderApiAuthResult = OrderApiAuthSuccess | ApiAuthFailure;

export async function requireOrderApiAuth(
  request?: Pick<NextRequest, "signal">,
  opts?: {
    /** Require at least one of these dashboard access keys (or super admin). */
    access?: Array<"ORDER_FOOD" | "ORDER_PARCEL" | "ORDER_PERSON_RIDE">;
  }
): Promise<OrderApiAuthResult> {
  const auth = await getAuthenticatedApiUser(request);
  if (!auth.ok) return auth;

  const { user } = auth;
  const keys = opts?.access ?? ["ORDER_FOOD", "ORDER_PARCEL", "ORDER_PERSON_RIDE"];

  const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
  if (userIsSuperAdmin) {
    return { ok: true, user };
  }

  for (const key of keys) {
    if (await hasDashboardAccessByAuth(user.id, user.email ?? "", key)) {
      return { ok: true, user };
    }
  }

  return {
    ok: false,
    status: 403,
    body: {
      success: false,
      error: "Insufficient permissions. Access to Orders dashboard required.",
      code: "FORBIDDEN",
    },
  };
}

export function orderAuthFailureResponse(
  failure: Exclude<OrderApiAuthResult, OrderApiAuthSuccess>
): NextResponse {
  if (failure.status === 403) {
    return NextResponse.json(failure.body, { status: 403 });
  }
  return authFailureResponse(failure);
}
