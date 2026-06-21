import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { approvePayoutRpc, completeMerchantPayoutWithPgTxn, listMerchantPayouts, rejectPayoutRpc, updateMerchantPayoutPgOrUtr } from "@/lib/db/operations/payment-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const payouts = await listMerchantPayouts(200);
    return NextResponse.json({ success: true, payouts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const systemUser = user?.email ? await getSystemUserByEmail(user.email) : null;
  const systemUserId = systemUser?.id;
  if (!systemUserId) {
    return NextResponse.json({ success: false, error: "System user required" }, { status: 403 });
  }

  let body: {
    action?: string;
    payoutId?: number;
    reason?: string;
    pgTransactionId?: string;
    utrReference?: string;
    field?: "pg" | "utr";
    value?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const payoutId = Number(body.payoutId);
  if (!Number.isFinite(payoutId)) {
    return NextResponse.json({ success: false, error: "payoutId required" }, { status: 400 });
  }

  try {
    if (body.action === "approve") {
      try {
        const result = await approvePayoutRpc(payoutId, systemUserId);
        return NextResponse.json({ success: true, result: result ?? { ok: true } });
      } catch (rpcErr) {
        const msg = rpcErr instanceof Error ? rpcErr.message : "Approve failed";
        if (msg.includes("payment_approve") || msg.includes("does not exist")) {
          return NextResponse.json({
            success: false,
            error: "Payment engine not ready — run migration 0239 on Supabase.",
          }, { status: 503 });
        }
        throw rpcErr;
      }
    }
    if (body.action === "reject") {
      try {
        const result = await rejectPayoutRpc(
          payoutId,
          systemUserId,
          body.reason?.trim() || "Rejected by admin"
        );
        return NextResponse.json({ success: true, result: result ?? { ok: true } });
      } catch (rpcErr) {
        const msg = rpcErr instanceof Error ? rpcErr.message : "Reject failed";
        return NextResponse.json({ success: false, error: msg }, { status: 400 });
      }
    }
    if (body.action === "complete") {
      const pgTransactionId = body.pgTransactionId?.trim();
      if (!pgTransactionId) {
        return NextResponse.json({ success: false, error: "pgTransactionId is required" }, { status: 400 });
      }
      try {
        const result = await completeMerchantPayoutWithPgTxn(
          payoutId,
          pgTransactionId,
          systemUserId,
          body.utrReference?.trim() || null
        );
        return NextResponse.json({ success: true, result: result ?? { ok: true } });
      } catch (rpcErr) {
        const msg = rpcErr instanceof Error ? rpcErr.message : "Complete failed";
        if (msg.includes("payment_complete_merchant_payout") || msg.includes("does not exist")) {
          return NextResponse.json({
            success: false,
            error: "Run migration 0270_merchant_payout_pg_transaction_id.sql on Supabase.",
          }, { status: 503 });
        }
        return NextResponse.json({ success: false, error: msg }, { status: 400 });
      }
    }
    if (body.action === "updateRefs") {
      const field = body.field;
      if (field !== "pg" && field !== "utr") {
        return NextResponse.json({ success: false, error: "field must be pg or utr" }, { status: 400 });
      }
      const value = body.value ?? (field === "pg" ? body.pgTransactionId : body.utrReference) ?? "";
      try {
        const result = await updateMerchantPayoutPgOrUtr(payoutId, field, String(value));
        return NextResponse.json({ success: true, result });
      } catch (rpcErr) {
        const msg = rpcErr instanceof Error ? rpcErr.message : "Update failed";
        return NextResponse.json({ success: false, error: msg }, { status: 400 });
      }
    }
    return NextResponse.json({ success: false, error: "action must be approve, reject, complete, or updateRefs" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
