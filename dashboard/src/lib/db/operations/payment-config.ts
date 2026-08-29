import { getSql } from "../client";
import { backendFetch } from "@/lib/notif-backend";

export type PaymentConfigBundle = {
  globalSettings: Record<string, unknown>[];
  settlementRules: Record<string, unknown>[];
  cancellationRules: Record<string, unknown>[];
  holdRules: Record<string, unknown>[];
  payoutRules: Record<string, unknown>[];
  commissionRules: Record<string, unknown>[];
  taxRules: Record<string, unknown>[];
  refundRules: Record<string, unknown>[];
  gatewaySettings: Record<string, unknown>[];
};

export async function getPaymentConfigBundle(): Promise<PaymentConfigBundle> {
  const sql = getSql();
  const safe = async (q: () => unknown) => {
    try {
      return (await q()) as unknown as Record<string, unknown>[];
    } catch {
      return [];
    }
  };

  return {
    globalSettings: await safe(() => sql`
      SELECT * FROM payment_global_settings WHERE is_active ORDER BY setting_key, version DESC
    `),
    settlementRules: await safe(() => sql`SELECT * FROM payment_settlement_rules ORDER BY priority, id`),
    cancellationRules: await safe(() => sql`SELECT * FROM payment_cancellation_rules ORDER BY priority, id`),
    holdRules: [],
    payoutRules: await safe(() => sql`SELECT * FROM payment_payout_rules ORDER BY id`),
    commissionRules: await safe(() => sql`SELECT * FROM payment_commission_rules ORDER BY id`),
    taxRules: await safe(() => sql`SELECT * FROM payment_tax_rules ORDER BY id`),
    refundRules: await safe(() => sql`SELECT * FROM payment_refund_rules ORDER BY id`),
    gatewaySettings: await safe(() => sql`SELECT id, provider, display_name, is_active, is_default, config FROM payment_gateway_settings ORDER BY provider`),
  };
}

export async function listMerchantPayouts(limit = 200) {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT
        pr.id,
        pr.wallet_id,
        pr.amount,
        pr.net_payout_amount,
        pr.commission_percentage,
        pr.commission_amount,
        pr.status,
        pr.pg_transaction_id,
        pr.utr_reference,
        pr.rejection_reason,
        ppa.approval_notes AS hold_reason,
        pr.requested_at,
        pr.approved_at,
        pr.completed_at,
        pr.bank_account_id,
        w.merchant_store_id,
        ms.store_id AS store_code,
        ms.store_name
      FROM merchant_payout_requests pr
      JOIN merchant_wallet w ON w.id = pr.wallet_id
      JOIN merchant_stores ms ON ms.id = w.merchant_store_id
      LEFT JOIN payment_payout_approvals ppa
        ON ppa.payout_request_id = pr.id AND ppa.payout_type = 'MERCHANT'
      ORDER BY pr.requested_at DESC
      LIMIT ${limit}
    `;
    return rows as Record<string, unknown>[];
  } catch {
    return [];
  }
}

export async function updateMerchantPayoutPgOrUtr(
  payoutId: number,
  field: "pg" | "utr",
  value: string
) {
  const sql = getSql();
  const trimmed = value.trim();
  if (field === "pg") {
    if (!trimmed) throw new Error("PG transaction ID is required");
    await sql`
      UPDATE merchant_payout_requests
      SET pg_transaction_id = ${trimmed}, updated_at = NOW()
      WHERE id = ${payoutId}
    `;
    try {
      await sql`
        UPDATE payment_payout_approvals
        SET gateway_payout_id = ${trimmed}, updated_at = NOW()
        WHERE payout_request_id = ${payoutId} AND payout_type = 'MERCHANT'
      `;
    } catch {
      /* pre-0239 */
    }
    return { ok: true, field: "pg" };
  }
  await sql`
    UPDATE merchant_payout_requests
    SET utr_reference = ${trimmed || null}, updated_at = NOW()
    WHERE id = ${payoutId}
  `;
  try {
    await sql`
      UPDATE payment_payout_approvals
      SET utr_reference = ${trimmed || null}, updated_at = NOW()
      WHERE payout_request_id = ${payoutId} AND payout_type = 'MERCHANT'
    `;
  } catch {
    /* pre-0239 */
  }
  return { ok: true, field: "utr" };
}

/** @deprecated use listMerchantPayouts */
export async function listPendingMerchantPayouts(limit = 50) {
  return listMerchantPayouts(limit);
}

export async function completeMerchantPayoutWithPgTxn(
  payoutId: number,
  pgTransactionId: string,
  systemUserId: number,
  utrReference?: string | null
) {
  const sql = getSql();
  let payoutType = "";
  try {
    const [typeRow] = await sql`
      SELECT payout_type FROM payment_payout_approvals
      WHERE payout_request_id = ${payoutId}
      LIMIT 1
    `;
    payoutType = String((typeRow as { payout_type?: string } | undefined)?.payout_type ?? "");
  } catch {
    /* optional */
  }
  const [wr] = await sql`SELECT id FROM withdrawal_requests WHERE id = ${payoutId} LIMIT 1`;
  if (payoutType === "RIDER" || wr) {
    return completeRiderWithdrawal(payoutId, pgTransactionId, systemUserId, utrReference);
  }

  const pg = pgTransactionId.trim();
  const utr = (utrReference ?? "").trim();
  const txnRef = pg || utr;
  if (!txnRef) throw new Error("PG transaction ID or UTR is required");
  const [row] = await sql`
    SELECT payment_complete_merchant_payout(
      ${payoutId}::bigint,
      ${txnRef},
      ${systemUserId}::bigint,
      ${utr || null}
    )::jsonb AS result
  `;
  const result = (row as { result?: Record<string, unknown> })?.result;
  void backendFetch(
    `/v1/internal/merchant/payout-requests/${payoutId}/withdrawal-completed-email`,
    { method: "POST", body: {} },
  ).catch(() => undefined);
  return result;
}

export async function approvePayoutRpc(
  payoutId: number,
  systemUserId: number,
  reason: string,
) {
  const notes = reason.trim();
  if (notes.length < 3) {
    throw new Error("Hold reason is required (min 3 characters)");
  }
  const sql = getSql();
  let payoutType = "";
  try {
    const [typeRow] = await sql`
      SELECT payout_type FROM payment_payout_approvals
      WHERE payout_request_id = ${payoutId}
      LIMIT 1
    `;
    payoutType = String((typeRow as { payout_type?: string } | undefined)?.payout_type ?? "");
  } catch {
    /* optional */
  }
  const [wr] = await sql`SELECT id FROM withdrawal_requests WHERE id = ${payoutId} LIMIT 1`;
  if (payoutType === "RIDER" || wr) {
    return approveRiderWithdrawal(payoutId, systemUserId, notes);
  }
  const [row] = await sql`
    SELECT payment_approve_merchant_payout(${payoutId}::bigint, ${systemUserId}::bigint, ${notes})::jsonb AS result
  `;
  return (row as { result?: Record<string, unknown> })?.result;
}

export async function rejectPayoutRpc(payoutId: number, systemUserId: number, reason: string) {
  const sql = getSql();
  let payoutType = "";
  try {
    const [row] = await sql`
      SELECT payout_type FROM payment_payout_approvals
      WHERE payout_request_id = ${payoutId}
      LIMIT 1
    `;
    payoutType = String((row as { payout_type?: string } | undefined)?.payout_type ?? "MERCHANT");
  } catch {
    /* optional */
  }
  const [wr] = await sql`SELECT id FROM withdrawal_requests WHERE id = ${payoutId} LIMIT 1`;
  if (payoutType === "RIDER" || wr) {
    await rejectRiderWithdrawal(payoutId, systemUserId, reason);
    return { ok: true, party: "RIDER" };
  }
  const [rpcRow] = await sql`
    SELECT payment_reject_merchant_payout(${payoutId}::bigint, ${systemUserId}::bigint, ${reason})::jsonb AS result
  `;
  return (rpcRow as { result?: Record<string, unknown> })?.result;
}

export async function listRiderPayouts(limit = 200) {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT
        wr.id,
        wr.rider_id,
        wr.amount,
        wr.status,
        wr.transaction_id AS pg_transaction_id,
        wr.failure_reason AS rejection_reason,
        ppa.approval_notes AS hold_reason,
        wr.created_at AS requested_at,
        wr.processed_at AS completed_at,
        wr.account_holder_name,
        wr.bank_acc,
        wr.ifsc,
        COALESCE(NULLIF(BTRIM(r.name), ''), r.mobile) AS rider_name,
        r.mobile AS rider_mobile
      FROM withdrawal_requests wr
      JOIN riders r ON r.id = wr.rider_id
      LEFT JOIN payment_payout_approvals ppa
        ON ppa.payout_request_id = wr.id AND ppa.payout_type = 'RIDER'
      ORDER BY wr.created_at DESC
      LIMIT ${limit}
    `;
    return rows as Record<string, unknown>[];
  } catch (e) {
    console.error("[listRiderPayouts]", e);
    throw e;
  }
}

export async function approveRiderWithdrawal(
  withdrawalId: number,
  systemUserId: number,
  holdReason: string,
) {
  const sql = getSql();
  const notes = holdReason.trim();
  if (notes.length < 3) {
    throw new Error("Hold reason is required (min 3 characters)");
  }
  const [row] = await sql`
    SELECT status, amount FROM withdrawal_requests WHERE id = ${withdrawalId} LIMIT 1
  `;
  if (!row) throw new Error("Withdrawal not found");
  const status = String((row as { status?: string }).status ?? "");
  if (status !== "pending") throw new Error(`Cannot approve withdrawal in status: ${status}`);
  const amount = Number((row as { amount?: unknown }).amount ?? 0);

  await sql`
    UPDATE withdrawal_requests
    SET status = 'processing', updated_at = NOW()
    WHERE id = ${withdrawalId}
  `;

  try {
    await sql`
      INSERT INTO payment_payout_approvals (
        payout_request_id, payout_type, status, amount, net_amount,
        approved_by_system_user_id, approval_notes
      ) VALUES (
        ${withdrawalId}, 'RIDER', 'APPROVED', ${amount}, ${amount},
        ${systemUserId}, ${notes}
      )
      ON CONFLICT (payout_request_id, payout_type) DO UPDATE
      SET status = 'APPROVED',
          approved_by_system_user_id = ${systemUserId},
          approval_notes = ${notes},
          updated_at = NOW()
    `;
  } catch {
    /* optional table */
  }
  return { ok: true };
}

export async function completeRiderWithdrawal(
  withdrawalId: number,
  pgTransactionId: string,
  systemUserId: number,
  utrReference?: string | null,
) {
  const pg = pgTransactionId.trim();
  const utr = (utrReference ?? "").trim();
  const txnRef = pg || utr;
  if (!txnRef) throw new Error("PG transaction ID or UTR is required");
  const sql = getSql();
  const [row] = await sql`
    SELECT status FROM withdrawal_requests WHERE id = ${withdrawalId} LIMIT 1
  `;
  if (!row) throw new Error("Withdrawal not found");
  const status = String((row as { status?: string }).status ?? "");
  if (status === "completed") return { ok: true };
  if (!["pending", "processing"].includes(status)) {
    throw new Error(`Cannot complete withdrawal in status: ${status}`);
  }

  await sql`
    UPDATE withdrawal_requests
    SET status = 'completed', transaction_id = ${txnRef}, processed_at = NOW(), updated_at = NOW()
    WHERE id = ${withdrawalId}
  `;

  try {
    await sql`
      UPDATE payment_payout_approvals
      SET
        status = 'COMPLETED',
        gateway_payout_id = ${txnRef},
        utr_reference = ${utr || null},
        approved_by_system_user_id = COALESCE(approved_by_system_user_id, ${systemUserId}),
        updated_at = NOW()
      WHERE payout_request_id = ${withdrawalId} AND payout_type = 'RIDER'
    `;
  } catch {
    /* optional */
  }
  return { ok: true };
}

export async function revertRiderWithdrawalWalletDebitFromDashboard(
  riderId: number,
  withdrawalId: number,
  amount: number,
  reason: string,
): Promise<void> {
  const sql = getSql();
  const ref = `failed_withdrawal_revert:${withdrawalId}`;
  const existing = await sql`
    SELECT 1 AS ok FROM wallet_ledger WHERE rider_id = ${riderId} AND ref = ${ref} LIMIT 1
  `;
  if (existing.length > 0) return;

  const [balRow] = await sql`
    SELECT COALESCE(total_balance, 0) AS bal FROM rider_wallet WHERE rider_id = ${riderId} LIMIT 1
  `;
  const balance = Math.round(Number((balRow as { bal?: unknown })?.bal ?? 0) * 100) / 100;
  const balanceAfter = Math.round((balance + amount) * 100) / 100;

  await sql`
    INSERT INTO wallet_ledger (
      rider_id, entry_type, amount, balance, ref, ref_type, description, metadata, performed_by_type
    ) VALUES (
      ${riderId}, 'failed_withdrawal_revert', ${amount.toFixed(2)}, ${balanceAfter.toFixed(2)},
      ${ref}, 'withdrawal',
      ${`Withdrawal rejected — amount reverted. Reason: ${reason.trim().slice(0, 400)}`},
      ${JSON.stringify({
        withdrawal_id: withdrawalId,
        reason: reason.trim(),
        rejection_reason: reason.trim(),
      })}::jsonb,
      'system'
    )
  `;
  await sql`
    UPDATE rider_wallet
    SET total_withdrawn = GREATEST(0, COALESCE(total_withdrawn, 0) - ${amount.toFixed(2)}), last_updated_at = NOW()
    WHERE rider_id = ${riderId}
  `;
}

export async function rejectRiderWithdrawal(
  withdrawalId: number,
  systemUserId: number,
  reason: string,
) {
  const sql = getSql();
  const [row] = await sql`
    SELECT id, rider_id, status, amount FROM withdrawal_requests WHERE id = ${withdrawalId} LIMIT 1
  `;
  if (!row) throw new Error("Withdrawal not found");
  const wr = row as { rider_id: number; status: string; amount: string };
  const status = String(wr.status ?? "");
  if (["completed", "failed", "cancelled"].includes(status)) {
    throw new Error(`Cannot reject withdrawal in status: ${status}`);
  }
  const riderId = Number(wr.rider_id);
  const amount = Math.round(Number(wr.amount) * 100) / 100;
  const rejectionReason = reason.trim();
  if (rejectionReason.length < 3) {
    throw new Error("Rejection reason is required (min 3 characters)");
  }

  await sql`
    UPDATE withdrawal_requests
    SET status = 'failed', failure_reason = ${rejectionReason}, processed_at = NOW(), updated_at = NOW()
    WHERE id = ${withdrawalId}
  `;
  await revertRiderWithdrawalWalletDebitFromDashboard(riderId, withdrawalId, amount, rejectionReason);

  try {
    await sql`
      UPDATE payment_payout_approvals
      SET status = 'FAILED', rejected_by_system_user_id = ${systemUserId},
          rejection_reason = ${rejectionReason}, updated_at = NOW()
      WHERE payout_request_id = ${withdrawalId} AND payout_type = 'RIDER'
    `;
  } catch {
    /* optional */
  }
  return { ok: true };
}

export async function updateRiderWithdrawalPgOrUtr(
  withdrawalId: number,
  field: "pg" | "utr",
  value: string,
) {
  const sql = getSql();
  const trimmed = value.trim();
  if (field === "pg") {
    if (!trimmed) throw new Error("PG transaction ID is required");
    await sql`
      UPDATE withdrawal_requests SET transaction_id = ${trimmed}, updated_at = NOW()
      WHERE id = ${withdrawalId}
    `;
    try {
      await sql`
        UPDATE payment_payout_approvals SET gateway_payout_id = ${trimmed}, updated_at = NOW()
        WHERE payout_request_id = ${withdrawalId} AND payout_type = 'RIDER'
      `;
    } catch {
      /* optional */
    }
    return { ok: true, field: "pg" };
  }
  try {
    await sql`
      UPDATE payment_payout_approvals SET utr_reference = ${trimmed || null}, updated_at = NOW()
      WHERE payout_request_id = ${withdrawalId} AND payout_type = 'RIDER'
    `;
  } catch {
    /* optional */
  }
  return { ok: true, field: "utr" };
}
