/**
 * GET /api/merchant/stores/[id]/pending-new-orders-count
 * Unaccepted orders (CREATED pipeline) for floating new-order bar.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolvePartnerPipeline } from "@/lib/partner-orders-unify";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ error: "Invalid store id" }, { status: 400 });
    }
    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ count: 0 });
    }

    const { data: rows, error } = await supabaseAdmin
      .from("orders_core")
      .select("status, current_status")
      .eq("merchant_store_id", access.store.id)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let count = 0;
    for (const o of rows || []) {
      const row = o as { status?: string; current_status?: string | null };
      if (resolvePartnerPipeline(null, row.status ?? "assigned", row.current_status ?? null) === "CREATED") {
        count += 1;
      }
    }

    return NextResponse.json({ count, store_id: access.store.store_id ?? String(storeId) });
  } catch (e) {
    console.error("[GET pending-new-orders-count]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
