/**
 * Shared ticket-API auth: cookie-first via getAuthenticatedApiUser.
 * Use this instead of supabase.auth.getUser() so parallel ticket loads don't 401/503.
 */

import { NextResponse } from "next/server";
import {
  getAuthenticatedApiUser,
  authFailureResponse,
  type ApiAuthRequest,
} from "@/lib/auth/api-session";
import { resolveSystemUserForSupabaseAuth, type SystemUser } from "@/lib/auth/user-mapping";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import type { User } from "@supabase/supabase-js";

export type TicketApiUserOk = {
  user: User;
  systemUser: SystemUser;
  email: string;
  isSuperAdmin: boolean;
};

export type TicketApiUserResult =
  | TicketApiUserOk
  | { error: NextResponse };

export async function requireTicketApiUser(
  request?: ApiAuthRequest
): Promise<TicketApiUserResult> {
  const auth = await getAuthenticatedApiUser(request);
  if (!auth.ok) {
    return { error: authFailureResponse(auth) };
  }
  const { user } = auth;
  const systemUser = await resolveSystemUserForSupabaseAuth(user.id, user.email);
  if (!systemUser) {
    return {
      error: NextResponse.json({ success: false, error: "User not found" }, { status: 404 }),
    };
  }
  const email = (user.email ?? systemUser.email ?? "").trim();
  const userIsSuperAdmin = await isSuperAdmin(user.id, email || systemUser.email);
  const hasTicketAccess = await hasDashboardAccessByAuth(
    user.id,
    email || systemUser.email,
    "TICKET"
  );
  if (!userIsSuperAdmin && !hasTicketAccess) {
    return {
      error: NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 }
      ),
    };
  }
  return {
    user,
    systemUser,
    email: email || systemUser.email,
    isSuperAdmin: userIsSuperAdmin,
  };
}
