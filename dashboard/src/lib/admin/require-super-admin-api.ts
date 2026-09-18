import { NextRequest, NextResponse } from "next/server";
import { authFailureResponse, getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { getSuperAdminPermissions } from "@/lib/permissions/engine";

export async function requireSuperAdminApi(request?: NextRequest) {
  const auth = await getAuthenticatedApiUser(request);
  if (!auth.ok) {
    return { ok: false as const, response: authFailureResponse(auth) };
  }
  const { user } = auth;
  if (!user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 401 }
      ),
    };
  }

  const perms = await getSuperAdminPermissions(user.id, user.email ?? "");
  if (!perms) {
    await new Promise((r) => setTimeout(r, 250));
    const retry = await getSuperAdminPermissions(user.id, user.email ?? "");
    if (!retry) {
      return {
        ok: false as const,
        response: NextResponse.json(
          {
            success: false,
            error: "Service temporarily unavailable",
            code: "SERVICE_UNAVAILABLE",
          },
          { status: 503 }
        ),
      };
    }
    if (!retry.isSuperAdmin) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { success: false, error: "Super admin only", code: "FORBIDDEN" },
          { status: 403 }
        ),
      };
    }
    return { ok: true as const, systemUserId: retry.systemUserId };
  }
  if (!perms.isSuperAdmin) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, error: "Super admin only", code: "FORBIDDEN" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, systemUserId: perms.systemUserId };
}
