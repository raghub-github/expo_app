/**
 * GET /api/area-manager/me
 * Returns current area manager type and id for UI (e.g. sidebar filtering).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAreaManagerApiAuth } from "@/lib/area-manager/auth";
import { resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) return authFailureResponse(auth);
    const authResult = await requireAreaManagerApiAuth(
      async () => ({ id: auth.user.id, email: auth.user.email }),
      request
    );
    if (authResult.error) return authResult.error;
    const { resolved } = authResult;

    const systemUser = await resolveSystemUserForSupabaseAuth(
      auth.user.id,
      auth.user.email
    );

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
