/**
 * GET /api/riders/pending-onboarding
 * List riders whose onboarding is not yet ACTIVE (ops call queue).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listRidersPendingOnboarding } from "@/lib/db/operations/riders";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      if (isInvalidRefreshToken(userError)) {
        await signOutIfSessionDead(supabase, userError);
        return NextResponse.json(
          { success: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const session = { user };
    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
    const hasRiderAccess = await hasDashboardAccessByAuth(
      session.user.id,
      session.user.email!,
      "RIDER"
    );

    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. RIDER dashboard access required.",
        },
        { status: 403 }
      );
    }

    const sp = request.nextUrl.searchParams;
    const limitRaw = Number(sp.get("limit") || "50");
    const offsetRaw = Number(sp.get("offset") || "0");
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
    const stage = sp.get("stage");
    const search = sp.get("search") || sp.get("q");

    const { riders, total } = await listRidersPendingOnboarding({
      limit,
      offset,
      stage,
      search,
    });

    return NextResponse.json({
      success: true,
      data: riders,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[riders/pending-onboarding]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load pending onboarding riders" },
      { status: 500 }
    );
  }
}
