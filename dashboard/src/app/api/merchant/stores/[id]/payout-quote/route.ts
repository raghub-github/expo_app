/**
 * GET /api/merchant/stores/[id]/payout-quote?amount=123.45
 * Returns withdrawal quote: requested_amount, commission_*, net_payout_amount, etc.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";

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
    const { searchParams } = new URL(request.url);
    const amount = parseFloat(searchParams.get("amount") ?? "0");
    if (!Number.isFinite(amount) || amount < 100) {
      return NextResponse.json({ success: false, error: "Amount must be at least 100" }, { status: 400 });
    }
    // TODO: compute from platform commission rules
    const commission_percentage = 2;
    const commission_amount = Math.round((amount * commission_percentage) / 100 * 100) / 100;
    const gst_on_commission_percent = 18;
    const gst_on_commission = Math.round((commission_amount * gst_on_commission_percent) / 100 * 100) / 100;
    const tds_amount = 0;
    const tax_amount = gst_on_commission;
    const net_payout_amount = Math.round((amount - commission_amount - gst_on_commission - tds_amount) * 100) / 100;
    return NextResponse.json({
      success: true,
      requested_amount: amount,
      commission_percentage,
      commission_amount,
      gst_on_commission_percent,
      gst_on_commission,
      tds_amount,
      tax_amount,
      net_payout_amount,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/payout-quote]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
