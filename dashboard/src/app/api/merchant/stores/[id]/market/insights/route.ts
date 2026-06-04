/**
 * GET /api/merchant/stores/[id]/market/insights
 * Locality + competitor affinity from orders_core (merchant_store_competitor_snapshots).
 */
import { NextRequest, NextResponse } from "next/server";
import { assertStoreAccess } from "@/app/api/merchant/stores/[id]/menu/assert-store-access";
import { getSql } from "@/lib/db/client";
import { loadMerchantMarketInsights } from "@/lib/merchant-store-competitors";

export const runtime = "nodejs";

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
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const scope = request.nextUrl.searchParams.get("scope");
    const limitRaw = parseInt(request.nextUrl.searchParams.get("limit") ?? "10", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 20) : 10;
    const sql = getSql();
    const insights = await loadMerchantMarketInsights(sql, storeId, scope, limit);
    if (!insights) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, ...insights });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/market/insights]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
