/**
 * GET /api/merchant/stores/[id]/payout-request/[requestId]
 * Returns payout details and bank info for ledger expand.
 */
import { NextResponse } from "next/server";
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
  _request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  try {
    const { id, requestId } = await params;
    const storeId = parseInt(id, 10);
    const requestIdNum = parseInt(requestId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(requestIdNum)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    // TODO: load from payout_requests + bank account by requestId and storeId
    const payout = {
      id: requestIdNum,
      amount: 0,
      net_payout_amount: 0,
      commission_percentage: 0,
      commission_amount: 0,
      status: "PENDING",
      utr_reference: null as string | null,
      requested_at: new Date().toISOString(),
    };
    const bank = null as {
      account_holder_name: string;
      account_number_masked: string | null;
      bank_name: string;
      payout_method: string;
      upi_id: string | null;
      ifsc_code?: string | null;
    } | null;
    return NextResponse.json({ success: true, payout, bank });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/payout-request/[requestId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
