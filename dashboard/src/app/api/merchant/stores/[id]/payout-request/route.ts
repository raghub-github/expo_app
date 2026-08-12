/**
 * POST /api/merchant/stores/[id]/payout-request
 * Body: { amount: number, bank_account_id: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { createWithdrawalRequest } from "@/lib/db/operations/merchant-wallet";

export const runtime = "nodejs";

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Forbidden" };
  const systemUser = await getSystemUserByEmail(user.email);
  const areaManagerId = await resolveMerchantListAreaManagerId({
    supabaseAuthId: user.id,
    email: user.email,
  });
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
      return NextResponse.json({ success: false, error: "Valid amount required" }, { status: 400 });
    }
    if (!Number.isFinite(bank_account_id)) {
      return NextResponse.json({ success: false, error: "Bank account required" }, { status: 400 });
    }

    const payout = await createWithdrawalRequest(storeId, amount, bank_account_id);
    return NextResponse.json(
      {
        success: true,
        payout: {
          id: payout.payout_request_id,
          amount: payout.amount,
          net_payout_amount: payout.net_payout_amount,
          commission_percentage: payout.commission_percentage,
          commission_amount: payout.commission_amount,
          status: payout.status,
          requested_at: new Date().toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    console.error("[POST /api/merchant/stores/[id]/payout-request]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
