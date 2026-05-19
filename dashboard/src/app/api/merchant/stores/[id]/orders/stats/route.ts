/**
 * GET /api/merchant/stores/[id]/orders/stats
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";
import { loadMerchantStoreFoodOrderStats } from "@/lib/merchant-food-orders/load-store-food-order-stats";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const dateParam = new URL(request.url).searchParams.get("date");
    const stats = await loadMerchantStoreFoodOrderStats(access.store.id, dateParam);

    return NextResponse.json(stats);
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/orders/stats]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
