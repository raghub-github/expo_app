/**
 * GET /api/merchant/wallet-requests/summary
 * Returns status counts for wallet credit/debit requests across stores (scoped by access).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMerchantAccess } from "@/lib/permissions/merchant-access";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const access = await getMerchantAccess(user.id, user.email);
    if (!access) {
      return NextResponse.json({ success: false, error: "Merchant access required" }, { status: 403 });
    }

    const sql = getSql();
    let areaManagerId: number | null = null;
    if (!access.isSuperAdmin && !access.isAdmin) {
      const am = await getAreaManagerByUserId(access.systemUserId);
      if (am) areaManagerId = am.id;
    }

    const storeFilter = areaManagerId != null
      ? sql`AND ms.area_manager_id = ${areaManagerId}`
      : sql``;

    const rows = await sql`
      SELECT mwcr.status, COUNT(*)::int AS count
      FROM merchant_wallet_credit_requests mwcr
      JOIN merchant_stores ms ON ms.id = mwcr.merchant_store_id
      WHERE 1=1 ${storeFilter}
      GROUP BY mwcr.status
    `;

    const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 };
    for (const r of rows as any[]) {
      const s = String(r.status ?? "");
      if (!s) continue;
      counts[s] = Number(r.count ?? 0);
    }
    const total = Object.values(counts).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

    return NextResponse.json({ success: true, counts, total });
  } catch (e) {
    console.error("[GET /api/merchant/wallet-requests/summary]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

