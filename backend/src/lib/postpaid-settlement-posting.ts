import type { TransactionSql } from "postgres";
import type { PostpaidService, PostpaidSettlementResult } from "./postpaid-settlement.js";

/**
 * DB side of the post-paid settlement engine: moves the rider wallet by the
 * amount lib/postpaid-settlement.ts decided, inside the caller's transaction.
 *
 * wallet_ledger's AFTER INSERT trigger (trigger_update_wallet_from_ledger) is the
 * only thing that changes rider_wallet.total_balance here. The row is locked
 * first so balance-before/after are exact and concurrent settlements, recharges
 * and penalties on the same rider serialise instead of racing.
 *
 * Sign convention (what the trigger and the rider app both read):
 *   credit → entry_type 'earning',    amount > 0
 *   debit  → entry_type 'adjustment', amount < 0
 * The pre-0649 ride cash debit was written as a POSITIVE 'adjustment', which the
 * trigger reads as a credit; the engine then overwrote the balance, so balances
 * were right but the ledger row said the opposite of what happened.
 */

export type SettlementWalletMovement = {
  balanceBefore: number;
  balanceAfter: number;
  posted: "credit" | "debit" | "none";
  /** The ref was already in the ledger: nothing was posted this time. */
  duplicate: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const NEGATIVE_USED_COLUMN: Record<PostpaidService, "negative_used_person_ride" | "negative_used_parcel"> = {
  person_ride: "negative_used_person_ride",
  parcel: "negative_used_parcel",
};

export async function applySettlementWalletMovement(
  tx: TransactionSql,
  args: {
    riderId: number;
    service: PostpaidService;
    settlement: Pick<PostpaidSettlementResult, "walletCreditPaise" | "walletDebitPaise">;
    /** Shared with the delivery credit path so a stray legacy credit is a no-op. */
    creditRef: string;
    debitRef: string;
    refType: string;
    creditDescription: string;
    debitDescription: string;
    metadata: Record<string, unknown>;
  }
): Promise<SettlementWalletMovement> {
  const creditPaise = args.settlement.walletCreditPaise;
  const debitPaise = args.settlement.walletDebitPaise;
  if (creditPaise > 0 && debitPaise > 0) {
    throw new Error("settlement wallet movement cannot be both a credit and a debit");
  }

  await tx`
    INSERT INTO rider_wallet (rider_id, total_balance, last_updated_at)
    VALUES (${args.riderId}, 0, NOW())
    ON CONFLICT (rider_id) DO NOTHING
  `;
  const negCol = NEGATIVE_USED_COLUMN[args.service];
  const locked = await tx<Array<{ total_balance: string | null; negative_used: string | null }>>`
    SELECT total_balance, ${tx(negCol)} AS negative_used
    FROM rider_wallet
    WHERE rider_id = ${args.riderId}
    FOR UPDATE
  `;
  const balanceBefore = round2(Number(locked[0]?.total_balance ?? 0));

  if (!(creditPaise > 0) && !(debitPaise > 0)) {
    return { balanceBefore, balanceAfter: balanceBefore, posted: "none", duplicate: false };
  }

  const isCredit = creditPaise > 0;
  const ref = isCredit ? args.creditRef : args.debitRef;
  const dup = await tx<Array<{ ok: number }>>`
    SELECT 1 AS ok FROM wallet_ledger
    WHERE rider_id = ${args.riderId} AND ref = ${ref}
    LIMIT 1
  `;
  if (dup.length > 0) {
    return { balanceBefore, balanceAfter: balanceBefore, posted: "none", duplicate: true };
  }

  const amount = round2((isCredit ? creditPaise : debitPaise) / 100);
  const balanceAfter = round2(isCredit ? balanceBefore + amount : balanceBefore - amount);

  await tx`
    INSERT INTO wallet_ledger (
      rider_id, entry_type, amount, balance,
      service_type, ref, ref_type, description, metadata,
      performed_by_type
    ) VALUES (
      ${args.riderId},
      ${isCredit ? "earning" : "adjustment"},
      ${(isCredit ? amount : -amount).toFixed(2)},
      ${balanceAfter.toFixed(2)},
      ${args.service}, ${ref}, ${args.refType},
      ${isCredit ? args.creditDescription : args.debitDescription},
      ${JSON.stringify({ ...args.metadata, walletBalanceBefore: balanceBefore })}::text::jsonb,
      'system'
    )
  `;

  if (!isCredit && balanceAfter < 0) {
    // Same per-service negative accounting the cash ride debit has always kept,
    // which the negative-wallet block thresholds read.
    const negativeUsedDelta = balanceBefore >= 0 ? round2(amount - balanceBefore) : amount;
    const currentNeg = Number(locked[0]?.negative_used ?? 0);
    await tx`
      UPDATE rider_wallet
      SET ${tx(negCol)} = ${round2(currentNeg + negativeUsedDelta).toFixed(2)},
          last_updated_at = NOW()
      WHERE rider_id = ${args.riderId}
    `;
  }

  const after = await tx<Array<{ total_balance: string | null }>>`
    SELECT total_balance FROM rider_wallet WHERE rider_id = ${args.riderId}
  `;
  const actualAfter = round2(Number(after[0]?.total_balance ?? 0));
  if (Math.abs(actualAfter - balanceAfter) > 0.005) {
    // The trigger is the only mutator; a mismatch means it is missing or changed.
    // Fail the whole settlement rather than leave the wallet and ledger disagreeing.
    throw new Error(
      `wallet trigger mismatch for rider ${args.riderId}: expected ${balanceAfter}, found ${actualAfter}`
    );
  }

  return { balanceBefore, balanceAfter, posted: isCredit ? "credit" : "debit", duplicate: false };
}

export type SettlementExtensionFields = {
  service: PostpaidService;
  settlement: PostpaidSettlementResult;
  walletBalanceBefore: number | null;
  walletBalanceAfter: number | null;
  reconciliationReason?: string | null;
  extraMetadata?: Record<string, unknown>;
};

/**
 * Writes the 0649 columns onto a just-inserted ride_settlements row. Runs in a
 * savepoint so a database that has not had 0649 applied yet still settles the
 * job (the money movement is what matters); the failure is logged loudly.
 */
export async function recordSettlementExtensions(
  tx: TransactionSql,
  settlementId: string,
  ext: SettlementExtensionFields
): Promise<void> {
  const s = ext.settlement;
  const reasons = [...s.warnings];
  if (ext.reconciliationReason) reasons.push(ext.reconciliationReason);
  const needsReview = reasons.length > 0;
  const meta = {
    settlementEngine: "postpaid-v1",
    journal: s.journal,
    warnings: s.warnings,
    platformCommissionPaise: s.platformCommissionPaise,
    promotionalSubsidyPaise: s.promotionalSubsidyPaise,
    platformNetPaise: s.platformNetPaise,
    ...(ext.extraMetadata ?? {}),
  };
  try {
    await tx.savepoint(async (sp) => {
      await sp`
        UPDATE ride_settlements
        SET service_type = ${ext.service},
            cash_collected = ${(s.cashCollectedPaise / 100).toFixed(2)},
            promotion_subsidy = ${(s.promotionalSubsidyPaise / 100).toFixed(2)},
            tip_amount = ${(s.tipPaise / 100).toFixed(2)},
            incentive_amount = ${(s.incentivePaise / 100).toFixed(2)},
            wallet_balance_before = ${ext.walletBalanceBefore == null ? null : ext.walletBalanceBefore.toFixed(2)},
            wallet_balance_after = ${ext.walletBalanceAfter == null ? null : ext.walletBalanceAfter.toFixed(2)},
            reconciliation_status = ${needsReview ? "required" : "none"},
            reconciliation_reason = ${needsReview ? reasons.join("; ") : null},
            reconciliation_flagged_at = ${needsReview ? new Date().toISOString() : null},
            metadata = metadata || ${JSON.stringify(meta)}::text::jsonb,
            updated_at = NOW()
        WHERE settlement_id = ${settlementId}
      `;
    });
  } catch (err) {
    console.error(
      "[postpaid-settlement] extension columns not written (is migration 0649 applied?)",
      settlementId,
      (err as Error)?.message ?? err
    );
  }
}

/**
 * A refund processed after a Ride/Parcel was settled. The rider was already paid
 * (wallet credit or cash), so the refund is never reversed against them blindly —
 * a disputed waiting charge is not the whole fare. The settlement is flagged for
 * an admin to decide the component-level adjustment. Idempotent per refund id.
 */
export async function flagSettlementsForRefund(args: {
  razorpayPaymentId: string;
  refundId: string;
  amountPaise: number | null;
}): Promise<number> {
  const { getSql } = await import("../db/client.js");
  const sql = getSql();
  const paymentId = args.razorpayPaymentId.trim();
  if (!paymentId) return 0;
  const amount =
    args.amountPaise != null && args.amountPaise > 0 ? `₹${(args.amountPaise / 100).toFixed(2)} ` : "";
  const reason = `refund ${args.refundId} ${amount}processed after settlement — rider payout not reversed; needs a component-level adjustment`;
  const rows = await sql<Array<{ settlement_id: string }>>`
    UPDATE ride_settlements s
    SET reconciliation_status = 'required',
        reconciliation_reason = concat_ws('; ', NULLIF(s.reconciliation_reason, ''), ${reason}::text),
        reconciliation_flagged_at = COALESCE(s.reconciliation_flagged_at, NOW()),
        updated_at = NOW()
    WHERE (
        s.razorpay_payment_id = ${paymentId}
        OR s.order_id_text IN (
          SELECT p.order_id FROM orders_core_payments p
          WHERE p.transaction_id = ${paymentId}
             OR p.gateway_response->>'razorpayPaymentId' = ${paymentId}
        )
      )
      AND position(${args.refundId}::text IN COALESCE(s.reconciliation_reason, '')) = 0
    RETURNING s.settlement_id
  `;
  return rows.length;
}
