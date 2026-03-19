/**
 * GET /api/merchant/stores/[id]/wallet
 * Returns wallet summary for the store (dashboard MX view).
 */
import { NextResponse } from "next/server";
import { assertStoreAccess } from "@/app/api/merchant/stores/[id]/menu/assert-store-access";
import { getWalletSummary } from "@/lib/db/operations/merchant-wallet";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
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
    let summary;
    try {
      summary = await getWalletSummary(storeId);
    } catch (walletErr) {
      console.error("[GET /api/merchant/stores/[id]/wallet] getWalletSummary:", walletErr);
      summary = {
        wallet_id: 0,
        available_balance: 0,
        pending_balance: 0,
        hold_balance: 0,
        reserve_balance: 0,
        locked_balance: 0,
        pending_settlement: 0,
        lifetime_credit: 0,
        lifetime_debit: 0,
        total_earned: 0,
        total_withdrawn: 0,
        total_penalty: 0,
        total_commission_deducted: 0,
        status: "ACTIVE" as const,
        today_earning: 0,
        yesterday_earning: 0,
        pending_withdrawal_total: 0,
      };
    }
    return NextResponse.json({ success: true, ...summary });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/wallet]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
