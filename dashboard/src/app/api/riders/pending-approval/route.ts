/**
 * GET /api/riders/pending-approval
 * Admin queue: riders in APPROVAL stage with completed onboarding payment.
 * Unpaid / identity-only riders are never included.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listRidersPendingApproval } from "@/lib/db/operations/riders";
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

    const limitRaw = Number(request.nextUrl.searchParams.get("limit") || "100");
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 100;
    const riders = await listRidersPendingApproval(limit);

    return NextResponse.json({
      success: true,
      data: { riders, count: riders.length },
    });
  } catch (error) {
    console.error("[riders/pending-approval]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load pending approval queue" },
      { status: 500 }
    );
  }
}
