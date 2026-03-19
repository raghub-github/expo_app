/**
 * POST /api/merchant/stores/[id]/payout-request
 * Body: { amount: number, bank_account_id: number }
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
  let systemUser: Awaited<ReturnType<typeof getSystemUserByEmail>> = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  } else {
    systemUser = await getSystemUserByEmail(user.email);
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };
  return { ok: true as const, store, user, systemUser };
}

export async function POST(
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
    // Only the merchant (store owner) can initiate withdrawals. Agents (system_users) cannot.
    if (access.systemUser) {
      return NextResponse.json(
        { success: false, error: "Only the merchant can initiate withdrawals. Agents cannot withdraw." },
        { status: 403 }
      );
    }
    const body = await request.json().catch(() => ({}));
    const amount = Number(body.amount);
    const bank_account_id = Number(body.bank_account_id);
    if (!Number.isFinite(amount) || amount < 100) {
      return NextResponse.json({ success: false, error: "Valid amount (min 100) required" }, { status: 400 });
    }
    if (!Number.isFinite(bank_account_id)) {
      return NextResponse.json({ success: false, error: "Bank account required" }, { status: 400 });
    }
    // TODO: create payout request in DB and debit wallet
    const payout = {
      id: Math.floor(Math.random() * 100000) + 1,
      amount,
      net_payout_amount: amount * 0.98,
      commission_percentage: 2,
      commission_amount: amount * 0.02,
      status: "PENDING",
      utr_reference: null as string | null,
      requested_at: new Date().toISOString(),
    };
    return NextResponse.json({ success: true, payout }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/payout-request]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
