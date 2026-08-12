/**
 * GET /api/merchant/stores/admin-overview
 * Admin merchants home: growth + verification trends + recent stores table.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import {
  getMerchantGrowthTrend,
  getVerificationTrend,
  listMerchantStores,
} from "@/lib/db/operations/merchant-stores";
import { getSystemUserEmailsByIds } from "@/lib/db/operations/users";

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
        { success: false, error: "Merchant dashboard access required", code: "MERCHANT_ACCESS_REQUIRED" },
        { status: 403 }
      );
    }

    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });

    const fromDate = request.nextUrl.searchParams.get("fromDate")?.trim() || undefined;
    const toDate = request.nextUrl.searchParams.get("toDate")?.trim() || undefined;
    const storeType = request.nextUrl.searchParams.get("storeType")?.trim() || undefined;
    const trendDaysRaw = request.nextUrl.searchParams.get("trendDays");
    const trendFrom = request.nextUrl.searchParams.get("trendFrom")?.trim() || undefined;
    const trendTo = request.nextUrl.searchParams.get("trendTo")?.trim() || undefined;
    const trendDays = trendDaysRaw ? Math.max(1, Math.min(365, parseInt(trendDaysRaw, 10) || 7)) : 7;

    const trendRange =
      trendFrom && trendTo
        ? { fromDate: trendFrom, toDate: trendTo }
        : { days: trendDays };

    const [growth, verificationTrend, listResult] = await Promise.all([
      getMerchantGrowthTrend(areaManagerId, trendRange),
      getVerificationTrend(areaManagerId, trendRange),
      listMerchantStores({
        areaManagerId,
        limit: 8,
        filter: "child",
        storeType,
        createdFrom: fromDate,
        createdTo: toDate,
      }),
    ]);

    const approvedByIds = [
      ...new Set(listResult.items.map((s) => s.approved_by).filter((id): id is number => id != null)),
    ];
    const verifiedByEmails = await getSystemUserEmailsByIds(approvedByIds);

    return NextResponse.json({
      success: true,
      growth,
      verificationTrend,
      stores: listResult.items.map((s) => ({
        type: "child" as const,
        id: s.id,
        store_id: s.store_id,
        parent_id: s.parent_id,
        name: s.store_display_name || s.store_name,
        city: s.city,
        approval_status: s.approval_status,
        store_type: s.store_type ?? null,
        onboarding_step: s.current_onboarding_step,
        onboarding_completed: s.onboarding_completed,
        store_email: s.store_email ?? null,
        store_phones: s.store_phones ?? null,
        created_at: s.created_at ? new Date(s.created_at).toISOString() : null,
        verified_by_email: s.approved_by != null ? verifiedByEmails.get(s.approved_by) ?? null : null,
      })),
      totalListed: listResult.items.length,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/admin-overview]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
