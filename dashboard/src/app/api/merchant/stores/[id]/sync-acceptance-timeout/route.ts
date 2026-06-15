/**
 * POST /api/merchant/stores/[id]/sync-acceptance-timeout
 * Cancels unaccepted orders past the acceptance window when the dashboard portal opens.
 */
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";
import { syncOrderAcceptanceTimeoutForStore } from "@/lib/order-acceptance-timeout-sync";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const sql = getSql();
    const log = {
      info: (o: object) => console.info("[sync-acceptance-timeout]", o),
      error: (o: object) => console.error("[sync-acceptance-timeout]", o),
    };
    const { cancelled } = await syncOrderAcceptanceTimeoutForStore(sql, access.store.id, log);

    return NextResponse.json({ cancelled, store_id: access.store.store_id ?? String(storeId) });
  } catch (e) {
    console.error("[POST sync-acceptance-timeout]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
