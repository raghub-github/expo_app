/**
 * GET /api/merchant/stores/[id]/orders
 * orders_core + orders_food (same pipeline as partnersite /api/food-orders).
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";
import { loadMerchantStoreFoodOrders } from "@/lib/merchant-food-orders/load-store-food-orders";

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
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 500);
    const status = searchParams.get("status");
    const ordersCoreIdRaw = searchParams.get("orders_core_id");
    const ordersCoreId =
      ordersCoreIdRaw != null && ordersCoreIdRaw !== ""
        ? parseInt(ordersCoreIdRaw, 10)
        : NaN;
    const ordersFoodIdRaw = searchParams.get("orders_food_id");
    const ordersFoodId =
      ordersFoodIdRaw != null && ordersFoodIdRaw !== ""
        ? parseInt(ordersFoodIdRaw, 10)
        : NaN;
    const formattedOrderId = searchParams.get("formatted_order_id")?.trim() || null;
    const lightweightParam = searchParams.get("lightweight");
    const lightweight =
      lightweightParam === "1" ||
      lightweightParam === "true" ||
      (limit <= 20 &&
        !Number.isFinite(ordersCoreId) &&
        !Number.isFinite(ordersFoodId) &&
        !formattedOrderId);

    const orders = await loadMerchantStoreFoodOrders(access.store.id, {
      limit,
      status,
      ordersCoreId: Number.isFinite(ordersCoreId) ? ordersCoreId : undefined,
      ordersFoodId: Number.isFinite(ordersFoodId) ? ordersFoodId : undefined,
      formattedOrderId,
      lightweight,
    });

    return NextResponse.json({ success: true, orders });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/orders]", e);
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
