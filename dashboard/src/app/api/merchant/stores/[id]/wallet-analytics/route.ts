/**
 * GET /api/merchant/stores/[id]/wallet-analytics?period=week|month|quarter
 * Same earnings-overview logic as partnersite /api/merchant/wallet/analytics.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import {
  getWalletAnalytics,
  type WalletAnalyticsPeriod,
} from "@/lib/db/operations/merchant-wallet";

export const runtime = "nodejs";

function parsePeriod(raw: string | null): WalletAnalyticsPeriod {
  if (raw === "month" || raw === "quarter") return raw;
  return "week";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const period = parsePeriod(request.nextUrl.searchParams.get("period"));
    const analytics = await getWalletAnalytics(store.id, period);
    return NextResponse.json({ success: true, ...analytics });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/wallet-analytics]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
