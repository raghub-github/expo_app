/**
 * GET /api/merchant/stores/[id]/pending-new-orders-count
 * Unaccepted orders (CREATED pipeline) for floating new-order bar.
 * Excludes orders past the acceptance window.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolvePartnerPipeline } from "@/lib/partner-orders-unify";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";
import { getSql } from "@/lib/db/client";
import {
  isWithinAcceptanceWindow,
  loadAcceptanceWindowMinutes,
} from "@/lib/order-acceptance-timeout-sync";

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

    const sql = getSql();
    const windowMins = await loadAcceptanceWindowMinutes(sql, access.store.id);

    const { data: rows, error } = await supabaseAdmin
      .from("orders_core")
      .select("id, status, current_status, created_at")
      .eq("merchant_store_id", access.store.id)
      .eq("status", "assigned")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const coreIds = (rows || [])
      .map((o) => Number((o as { id?: number }).id))
      .filter((id) => id > 0);
    const foodByCore = new Map<number, { order_status?: string | null; created_at?: string | null }>();

    if (coreIds.length > 0) {
      const { data: foodRows } = await supabaseAdmin
        .from("orders_food")
        .select("order_id, order_status, created_at")
        .eq("merchant_store_id", access.store.id)
        .in("order_id", coreIds);
      for (const f of foodRows || []) {
        const coreId = Number((f as { order_id?: number }).order_id);
        if (coreId > 0) {
          foodByCore.set(coreId, f as { order_status?: string | null; created_at?: string | null });
        }
      }
    }

    let count = 0;
    const nowMs = Date.now();
    for (const o of rows || []) {
      const row = o as {
        id?: number;
        status?: string;
        current_status?: string | null;
        created_at?: string | null;
      };
      const coreId = Number(row.id ?? 0);
      const food = coreId > 0 ? foodByCore.get(coreId) : undefined;
      if (
        resolvePartnerPipeline(
          food?.order_status ?? null,
          row.status ?? "assigned",
          row.current_status ?? null
        ) !== "CREATED"
      ) {
        continue;
      }

      const createdAt = food?.created_at ?? row.created_at ?? "";
      if (createdAt && !isWithinAcceptanceWindow(createdAt, windowMins, nowMs)) {
        continue;
      }
      count += 1;
    }

    return NextResponse.json({ count, store_id: access.store.store_id ?? String(storeId) });
  } catch (e) {
    console.error("[GET pending-new-orders-count]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
