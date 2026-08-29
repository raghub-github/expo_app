/**
 * GET /api/merchant/stores/[id]/payout-request/[requestId]
 * Returns payout details and bank info for ledger expand (partnersite parity).
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Forbidden" };
  const areaManagerId = await resolveMerchantListAreaManagerId({
    supabaseAuthId: user.id,
    email: user.email,
  });
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
    const store = access.store as { id: number };
    const sql = getSql();

    const [payout] = await sql`
      SELECT
        pr.id,
        pr.wallet_id,
        pr.amount,
        pr.net_payout_amount,
        pr.commission_percentage,
        pr.commission_amount,
        pr.status::text AS status,
        pr.bank_account_id,
        pr.pg_transaction_id,
        pr.utr_reference,
        pr.failure_reason,
        pr.requested_at,
        pr.approved_at,
        pr.processed_at,
        pr.completed_at
      FROM merchant_payout_requests pr
      INNER JOIN merchant_wallet w ON w.id = pr.wallet_id
      WHERE pr.id = ${requestIdNum}
        AND w.merchant_store_id = ${store.id}
      LIMIT 1
    `;

    if (!payout) {
      return NextResponse.json({ success: false, error: "Payout request not found" }, { status: 404 });
    }

    const row = payout as Record<string, unknown>;
    let pgTransactionId =
      (typeof row.pg_transaction_id === "string" ? row.pg_transaction_id.trim() : "") ||
      (typeof row.utr_reference === "string" ? row.utr_reference.trim() : "") ||
      null;

    try {
      const [approval] = await sql`
        SELECT gateway_payout_id, utr_reference
        FROM payment_payout_approvals
        WHERE payout_request_id = ${requestIdNum}
          AND payout_type = 'MERCHANT'
        LIMIT 1
      `;
      if (approval) {
        const a = approval as { gateway_payout_id?: string | null; utr_reference?: string | null };
        pgTransactionId =
          (a.gateway_payout_id?.trim() || "") ||
          (a.utr_reference?.trim() || "") ||
          pgTransactionId;
      }
    } catch {
      /* payment_payout_approvals may not exist */
    }

    let bank: {
      account_holder_name: string;
      account_number_masked: string | null;
      bank_name: string;
      payout_method: string;
      upi_id: string | null;
      ifsc_code?: string | null;
    } | null = null;

    const bankAccountId = Number(row.bank_account_id);
    if (Number.isFinite(bankAccountId) && bankAccountId > 0) {
      const [bankRow] = await sql`
        SELECT
          account_holder_name,
          account_number,
          ifsc_code,
          bank_name,
          payout_method,
          upi_id
        FROM merchant_store_bank_accounts
        WHERE id = ${bankAccountId}
          AND store_id = ${store.id}
        LIMIT 1
      `;
      if (bankRow) {
        const b = bankRow as {
          account_holder_name: string;
          account_number: string | null;
          ifsc_code: string | null;
          bank_name: string | null;
          payout_method: string | null;
          upi_id: string | null;
        };
        const accNum = (b.account_number ?? "").trim();
        bank = {
          account_holder_name: b.account_holder_name,
          account_number_masked: accNum ? `****${accNum.slice(-4)}` : null,
          bank_name: b.bank_name ?? "",
          payout_method: b.payout_method ?? "bank",
          upi_id: b.upi_id,
          ifsc_code: b.ifsc_code,
        };
      }
    }

    const toIso = (v: unknown): string | null => {
      if (v == null) return null;
      if (v instanceof Date) return v.toISOString();
      const s = String(v).trim();
      return s || null;
    };

    return NextResponse.json({
      success: true,
      payout: {
        id: Number(row.id),
        amount: Number(row.amount ?? 0),
        net_payout_amount: Number(row.net_payout_amount ?? 0),
        commission_percentage: Number(row.commission_percentage ?? 0),
        commission_amount: Number(row.commission_amount ?? 0),
        status: String(row.status ?? "PENDING"),
        utr_reference: (row.utr_reference as string | null) ?? null,
        pg_transaction_id: pgTransactionId,
        failure_reason: (row.failure_reason as string | null) ?? null,
        requested_at: toIso(row.requested_at),
        approved_at: toIso(row.approved_at),
        processed_at: toIso(row.processed_at),
        completed_at: toIso(row.completed_at),
      },
      bank,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/payout-request/[requestId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
