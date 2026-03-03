/**
 * GET /api/merchant/stores/stats
 * Returns counts of merchant_stores by category (total, verified, pending, rejected, new).
 * Scoped by area manager for non–super-admin users.
 * Query: fromDate, toDate (YYYY-MM-DD) — when set, counts are filtered by created_at range.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { countMerchantStoresByStatus } from "@/lib/db/operations/merchant-stores";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user?.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 401 }
      );
    }

    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Merchant dashboard access required",
          code: "MERCHANT_ACCESS_REQUIRED",
        },
        { status: 403 }
      );
    }

    let areaManagerId: number | null = null;
    if (!(await isSuperAdmin(user.id, user.email))) {
      const systemUser = await getSystemUserByEmail(user.email);
      if (systemUser) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }

    const fromDate = request.nextUrl.searchParams.get("fromDate")?.trim() || undefined;
    const toDate = request.nextUrl.searchParams.get("toDate")?.trim() || undefined;
    const stats = await countMerchantStoresByStatus(areaManagerId, {
      createdFrom: fromDate,
      createdTo: toDate,
    });
    return NextResponse.json({ success: true, ...stats });
  } catch (e) {
    console.error("[GET /api/merchant/stores/stats]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
