/**
 * GET /api/area-manager/me
 * Returns current area manager type and id for UI (e.g. sidebar filtering).
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth } from "@/lib/area-manager/auth";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const getAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      return data?.user ?? null;
    };
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const authResult = await requireAreaManagerApiAuth(getAuthUser);
    if (authResult.error) return authResult.error;
    const { resolved } = authResult;

    const systemUser =
      user?.email != null ? await getSystemUserByEmail(user.email) : null;
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
  } catch (error) {
    console.error("[GET /api/area-manager/me]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
