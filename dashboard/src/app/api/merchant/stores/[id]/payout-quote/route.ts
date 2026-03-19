/**
 * GET /api/merchant/stores/[id]/payout-quote?amount=123.45
 * Returns withdrawal quote: requested_amount, commission_*, net_payout_amount, etc.
 * Reads commission rates from platform_commission_rules for the store/parent.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Forbidden" };
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };
  return { ok: true as const, store };
}

async function getCommissionRates(storeId: number, parentId: number | null) {
  const sql = getSql();
  const rows = await sql`
    SELECT commission_percentage, gst_on_commission_percent, tds_percent
    FROM platform_commission_rules
    WHERE is_active = true
      AND (
        (scope = 'STORE' AND scope_id = ${storeId})
        OR (scope = 'PARENT' AND scope_id = ${parentId ?? 0})
        OR scope = 'GLOBAL'
      )
    ORDER BY
      CASE scope WHEN 'STORE' THEN 1 WHEN 'PARENT' THEN 2 ELSE 3 END
    LIMIT 1
  `;
  if (rows.length > 0) {
    const r = rows[0] as any;
    return {
      commission_percentage: Number(r.commission_percentage ?? 2),
      gst_on_commission_percent: Number(r.gst_on_commission_percent ?? 18),
      tds_percent: Number(r.tds_percent ?? 0),
    };
  }
  return { commission_percentage: 2, gst_on_commission_percent: 18, tds_percent: 0 };
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
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const store = access.store as { id: number; parent_id?: number | null };
    const { searchParams } = new URL(request.url);
    const amount = parseFloat(searchParams.get("amount") ?? "0");
    if (!Number.isFinite(amount) || amount < 100) {
      return NextResponse.json({ success: false, error: "Amount must be at least 100" }, { status: 400 });
    }

    const rates = await getCommissionRates(store.id, store.parent_id ?? null);
    const round = (n: number) => Math.round(n * 100) / 100;
    const commission_amount = round((amount * rates.commission_percentage) / 100);
    const gst_on_commission = round((commission_amount * rates.gst_on_commission_percent) / 100);
    const tds_amount = round((amount * rates.tds_percent) / 100);
    const tax_amount = round(gst_on_commission + tds_amount);
    const net_payout_amount = round(amount - commission_amount - gst_on_commission - tds_amount);

    return NextResponse.json({
      success: true,
      requested_amount: amount,
      commission_percentage: rates.commission_percentage,
      commission_amount,
      gst_on_commission_percent: rates.gst_on_commission_percent,
      gst_on_commission,
      tds_percent: rates.tds_percent,
      tds_amount,
      tax_amount,
      net_payout_amount,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/payout-quote]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
