/**
 * GET /api/area-manager/me
 * Returns current area manager type and id for UI (e.g. sidebar filtering).
 */

import { NextResponse } from "next/server";
import { requireAreaManagerApiAuth } from "@/lib/area-manager/auth";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAuthUserSafe } from "@/lib/auth/resolve-supabase-user";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const authUser = await getAuthUserSafe();
    const authResult = await requireAreaManagerApiAuth(async () => authUser);
    if (authResult.error) return authResult.error;
    const { resolved } = authResult;

    const systemUser =
      authUser?.email != null ? await getSystemUserByEmail(authUser.email) : null;

    return NextResponse.json({
      success: true,
      data: {
        managerType: resolved.managerType,
        areaManagerId: resolved.isSuperAdmin ? null : resolved.areaManager.id,
        areaManagerName: systemUser?.full_name ?? null,
        areaManagerCode: systemUser?.system_user_id ?? null,
        areaManagerPhone: systemUser?.mobile ?? null,
        areaManagerEmail: systemUser?.email ?? null,
      },
    });
  } catch (e) {
    console.error("[GET /api/area-manager/me]", e);
    const { body, status } = apiErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
