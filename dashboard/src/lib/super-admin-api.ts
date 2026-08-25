import { NextRequest, NextResponse } from "next/server";
import { authFailureResponse, getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { getUserPermissions } from "@/lib/permissions/engine";

export async function requireSuperAdminApi(
  request?: NextRequest
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const auth = await getAuthenticatedApiUser(request);
  if (!auth.ok) {
    return { ok: false, response: authFailureResponse(auth) };
  }
  const { user } = auth;
  if (!user?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Unauthorized", code: "SESSION_REQUIRED" },
        { status: 401 }
      ),
    };
  }

  const perms = await getUserPermissions(user.id, user.email ?? "");
  if (!perms) {
    return {
      ok: false,
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
  if (!perms.isSuperAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "Forbidden",
          message: "Super admin access required.",
          code: "FORBIDDEN",
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true };
}
