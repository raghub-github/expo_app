import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, getSql } from "../db/client.js";
import {
  riderPaymentMethods,
  riderWallet,
  withdrawalRequests,
} from "../db/schema.js";
import {
  decryptRiderAccountNumber,
  maskRiderAccountNumber,
} from "./rider-bank-payment-method.js";
import { readRiderWalletBalance } from "./rider-subscription-wallet.js";
import { WalletFrozenError } from "./wallet-freeze.js";

export const MIN_RIDER_WITHDRAWAL_AMOUNT = 100;
export const MAX_RIDER_WITHDRAWAL_AMOUNT = 100_000;
export const MAX_PENDING_RIDER_WITHDRAWALS = 3;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type RiderWithdrawalView = {
  id: number;
  amount: number;
  status: string;
  bankAccMasked: string;
  ifsc: string;
  accountHolderName: string;
  transactionId: string | null;
  failureReason: string | null;
  createdAt: string;
  processedAt: string | null;
};

async function readMinPayoutAmount(): Promise<number> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT min_payout_amount
      FROM payment_payout_rules
      WHERE is_active AND party_type = 'RIDER'
      ORDER BY id DESC
      LIMIT 1
    `;
    if (rows.length > 0) {
      const min = Number((rows[0] as { min_payout_amount?: unknown }).min_payout_amount);
      if (Number.isFinite(min) && min > 0) return min;
    }
  } catch {
    /* pre-0239 or no rider rule */
  }
  return MIN_RIDER_WITHDRAWAL_AMOUNT;
}

export async function getRiderPendingWithdrawalTotal(riderId: number): Promise<number> {
  const sql = getSql();
  try {
    const [row] = await sql`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM withdrawal_requests
      WHERE rider_id = ${riderId}
        AND status IN ('pending', 'processing')
    `;
    return round2(Number((row as { total?: unknown })?.total ?? 0));
  } catch {
    return 0;
  }
}

export async function getRiderWithdrawableBalance(riderId: number): Promise<number> {
  const [balance, pending] = await Promise.all([
    readRiderWalletBalance(riderId),
    getRiderPendingWithdrawalTotal(riderId),
  ]);
  return round2(Math.max(0, balance - pending));
}

async function getVerifiedBankMethod(riderId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(riderPaymentMethods)
    .where(
      and(
        eq(riderPaymentMethods.riderId, riderId),
        eq(riderPaymentMethods.methodType, "bank"),
        eq(riderPaymentMethods.verificationStatus, "verified"),
        isNull(riderPaymentMethods.deletedAt),
      ),
    )
    .orderBy(desc(riderPaymentMethods.isPrimary), desc(riderPaymentMethods.createdAt));

  const row =
    rows.find((r) => r.isPrimary === true && r.isActive !== false) ??
    rows.find((r) => r.isActive !== false) ??
    rows[0] ??
    null;

  if (!row) return null;

  const accountNumber = row.accountNumberEncrypted
    ? decryptRiderAccountNumber(row.accountNumberEncrypted)
    : null;

  return {
    id: row.id,
    accountHolderName: row.accountHolderName,
    bankName: row.bankName,
    ifsc: row.ifsc ?? "",
    accountNumberMasked: accountNumber
      ? maskRiderAccountNumber(accountNumber)
      : "••••",
  };
}

async function assertRiderCanWithdraw(riderId: number): Promise<void> {
  const db = getDb();
  const [wallet] = await db
    .select({
      isFrozen: riderWallet.isFrozen,
      freezeReason: riderWallet.freezeReason,
    })
    .from(riderWallet)
    .where(eq(riderWallet.riderId, riderId))
    .limit(1);

  if (wallet?.isFrozen) {
    throw new WalletFrozenError(wallet.freezeReason);
  }

  const { getRiderAccountRestrictions } = await import("./rider-account-restrictions.js");
  const restrictions = await getRiderAccountRestrictions(riderId);
  if (restrictions.globalWalletBlock) {
    throw new Error("Wallet balance is blocked. Clear dues before withdrawing.");
  }
  if (restrictions.accountRestricted) {
    throw new Error("Account is restricted. Contact support.");
  }
}

async function syncPayoutApprovalOnCreate(
  withdrawalId: number,
  riderId: number,
  amount: number,
): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      INSERT INTO payment_payout_approvals (
        payout_request_id,
        payout_type,
        status,
        amount,
        net_amount,
        metadata
      ) VALUES (
        ${withdrawalId},
        'RIDER',
        'PENDING',
        ${amount.toFixed(2)},
        ${amount.toFixed(2)},
        ${JSON.stringify({ rider_id: riderId, source: "rider_app" })}::text::jsonb
      )
      ON CONFLICT (payout_request_id, payout_type) DO NOTHING
    `;
  } catch {
    /* payment engine tables may not exist yet */
  }
}

export async function createRiderWithdrawalRequest(
  riderId: number,
  rawAmount: number,
): Promise<RiderWithdrawalView> {
  const amount = round2(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a valid amount");
  }

  const minAmount = await readMinPayoutAmount();
  if (amount < minAmount) {
    throw new Error(`Amount must be at least ₹${minAmount}`);
  }
  if (amount > MAX_RIDER_WITHDRAWAL_AMOUNT) {
    throw new Error(`Maximum ₹${MAX_RIDER_WITHDRAWAL_AMOUNT.toLocaleString("en-IN")} per request`);
  }

  await assertRiderCanWithdraw(riderId);

  const bank = await getVerifiedBankMethod(riderId);
  if (!bank) {
    throw new Error("Verified bank account required before withdrawal");
  }

  const sql = getSql();

  const [pendingRow] = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM withdrawal_requests
    WHERE rider_id = ${riderId}
      AND status IN ('pending', 'processing')
  `;
  const pendingCount = Number((pendingRow as { cnt?: unknown })?.cnt ?? 0);
  if (pendingCount >= MAX_PENDING_RIDER_WITHDRAWALS) {
    throw new Error(
      `Maximum ${MAX_PENDING_RIDER_WITHDRAWALS} pending withdrawals allowed. Wait for existing ones to complete.`,
    );
  }

  const withdrawable = await getRiderWithdrawableBalance(riderId);
  if (amount > withdrawable) {
    throw new Error("Insufficient withdrawable balance");
  }

  return sql.begin(async (tx) => {
    const [walletRow] = await tx`
      SELECT total_balance, is_frozen, freeze_reason
      FROM rider_wallet
      WHERE rider_id = ${riderId}
      FOR UPDATE
    `;
    if (!walletRow) {
      throw new Error("Rider wallet not found");
    }
    const frozen = Boolean((walletRow as { is_frozen?: unknown }).is_frozen);
    if (frozen) {
      const reason = (walletRow as { freeze_reason?: unknown }).freeze_reason;
      throw new WalletFrozenError(typeof reason === "string" ? reason : null);
    }
    const currentBalance = round2(Number((walletRow as { total_balance?: unknown })?.total_balance ?? 0));
    if (amount > currentBalance) {
      throw new Error("Insufficient wallet balance");
    }

    const [pendingCheck] = await tx`
      SELECT COALESCE(SUM(amount::numeric), 0) AS total
      FROM withdrawal_requests
      WHERE rider_id = ${riderId}
        AND status IN ('pending', 'processing')
    `;
    const pendingTotal = round2(Number((pendingCheck as { total?: unknown })?.total ?? 0));
    if (amount > round2(currentBalance - pendingTotal)) {
      throw new Error("Insufficient withdrawable balance");
    }

    const [withdrawal] = await tx`
      INSERT INTO withdrawal_requests (
        rider_id,
        payment_method_id,
        amount,
        status,
        bank_acc,
        ifsc,
        account_holder_name,
        metadata
      ) VALUES (
        ${riderId},
        ${bank.id},
        ${amount.toFixed(2)},
        'pending',
        ${bank.accountNumberMasked},
        ${bank.ifsc},
        ${bank.accountHolderName},
        ${JSON.stringify({ source: "rider_app", bank_name: bank.bankName })}::text::jsonb
      )
      RETURNING id, amount, status, bank_acc, ifsc, account_holder_name,
                transaction_id, failure_reason, created_at, processed_at
    `;

    const wr = withdrawal as {
      id: number;
      amount: string;
      status: string;
      bank_acc: string;
      ifsc: string;
      account_holder_name: string;
      transaction_id: string | null;
      failure_reason: string | null;
      created_at: Date;
      processed_at: Date | null;
    };

    const withdrawalId = Number(wr.id);
    const balanceAfter = round2(currentBalance - amount);
    const ledgerRef = String(withdrawalId);

    await tx`
      INSERT INTO wallet_ledger (
        rider_id,
        entry_type,
        amount,
        balance,
        ref,
        ref_type,
        description,
        metadata,
        performed_by_type
      ) VALUES (
        ${riderId},
        'withdrawal',
        ${amount.toFixed(2)},
        ${balanceAfter.toFixed(2)},
        ${ledgerRef},
        'withdrawal',
        ${`Withdrawal request #${withdrawalId}`},
        ${JSON.stringify({ withdrawal_id: withdrawalId, source: "rider_app" })}::text::jsonb,
        'rider'
      )
    `;

    await syncPayoutApprovalOnCreate(withdrawalId, riderId, amount);

    return {
      id: withdrawalId,
      amount: Number(wr.amount),
      status: wr.status,
      bankAccMasked: wr.bank_acc,
      ifsc: wr.ifsc,
      accountHolderName: wr.account_holder_name,
      transactionId: wr.transaction_id,
      failureReason: wr.failure_reason,
      createdAt: new Date(wr.created_at).toISOString(),
      processedAt: wr.processed_at ? new Date(wr.processed_at).toISOString() : null,
    };
  });
}

export async function listRiderWithdrawals(
  riderId: number,
  limit = 20,
): Promise<RiderWithdrawalView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(withdrawalRequests)
    .where(eq(withdrawalRequests.riderId, riderId))
    .orderBy(desc(withdrawalRequests.createdAt))
    .limit(Math.min(100, Math.max(1, limit)));

  return rows.map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    status: row.status,
    bankAccMasked: row.bankAcc,
    ifsc: row.ifsc,
    accountHolderName: row.accountHolderName,
    transactionId: row.transactionId,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
  }));
}

export async function revertRiderWithdrawalWalletDebit(
  riderId: number,
  withdrawalId: number,
  amount: number,
  reason: string,
): Promise<void> {
  const sql = getSql();
  const ref = `failed_withdrawal_revert:${withdrawalId}`;

  const existing = await sql`
    SELECT 1 AS ok FROM wallet_ledger
    WHERE rider_id = ${riderId} AND ref = ${ref}
    LIMIT 1
  `;
  if (existing.length > 0) return;

  const balance = await readRiderWalletBalance(riderId);
  const balanceAfter = round2(balance + amount);

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO wallet_ledger (
        rider_id,
        entry_type,
        amount,
        balance,
        ref,
        ref_type,
        description,
        metadata,
        performed_by_type
      ) VALUES (
        ${riderId},
        'failed_withdrawal_revert',
        ${amount.toFixed(2)},
        ${balanceAfter.toFixed(2)},
        ${ref},
        'withdrawal',
        ${`Withdrawal failed #${withdrawalId} — amount reverted`},
        ${JSON.stringify({ withdrawal_id: withdrawalId, reason })}::text::jsonb,
        'system'
      )
    `;

    await tx`
      UPDATE rider_wallet
      SET
        total_withdrawn = GREATEST(0, COALESCE(total_withdrawn, 0) - ${amount.toFixed(2)}),
        last_updated_at = NOW()
      WHERE rider_id = ${riderId}
    `;
  });
}

export async function listRiderPayoutsForAdmin(limit = 200): Promise<Record<string, unknown>[]> {
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
        wr.created_at AS requested_at,
        wr.processed_at AS completed_at,
        wr.account_holder_name,
        wr.bank_acc,
        wr.ifsc,
        r.full_name AS rider_name,
        r.mobile AS rider_mobile
      FROM withdrawal_requests wr
      JOIN riders r ON r.id = wr.rider_id
      ORDER BY wr.created_at DESC
      LIMIT ${limit}
    `;
    return rows as Record<string, unknown>[];
  } catch {
    return [];
  }
}

export async function approveRiderWithdrawal(
  withdrawalId: number,
  systemUserId: number,
): Promise<void> {
  const sql = getSql();
  const [row] = await sql`
    SELECT id, rider_id, status FROM withdrawal_requests WHERE id = ${withdrawalId} LIMIT 1
  `;
  if (!row) throw new Error("Withdrawal not found");
  const status = String((row as { status?: string }).status ?? "");
  if (status !== "pending") throw new Error(`Cannot approve withdrawal in status: ${status}`);

  await sql`
    UPDATE withdrawal_requests
    SET status = 'processing', updated_at = NOW()
    WHERE id = ${withdrawalId}
  `;

  try {
    await sql`
      UPDATE payment_payout_approvals
      SET
        status = 'APPROVED',
        approved_by_system_user_id = ${systemUserId},
        updated_at = NOW()
      WHERE payout_request_id = ${withdrawalId} AND payout_type = 'RIDER'
    `;
  } catch {
    /* optional */
  }
}

export async function completeRiderWithdrawal(
  withdrawalId: number,
  pgTransactionId: string,
  systemUserId: number,
  utrReference?: string | null,
): Promise<void> {
  const pg = pgTransactionId.trim();
  if (!pg) throw new Error("PG transaction ID is required");

  const sql = getSql();
  const [row] = await sql`
    SELECT id, rider_id, status, amount FROM withdrawal_requests WHERE id = ${withdrawalId} LIMIT 1
  `;
  if (!row) throw new Error("Withdrawal not found");

  const status = String((row as { status?: string }).status ?? "");
  if (status === "completed") return;
  if (!["pending", "processing"].includes(status)) {
    throw new Error(`Cannot complete withdrawal in status: ${status}`);
  }

  await sql`
    UPDATE withdrawal_requests
    SET
      status = 'completed',
      transaction_id = ${pg},
      processed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${withdrawalId}
  `;

  try {
    await sql`
      UPDATE payment_payout_approvals
      SET
        status = 'COMPLETED',
        gateway_payout_id = ${pg},
        utr_reference = ${utrReference?.trim() || null},
        approved_by_system_user_id = COALESCE(approved_by_system_user_id, ${systemUserId}),
        updated_at = NOW()
      WHERE payout_request_id = ${withdrawalId} AND payout_type = 'RIDER'
    `;
  } catch {
    /* optional */
  }
}

export async function rejectRiderWithdrawal(
  withdrawalId: number,
  systemUserId: number,
  reason: string,
): Promise<void> {
  const sql = getSql();
  const [row] = await sql`
    SELECT id, rider_id, status, amount FROM withdrawal_requests WHERE id = ${withdrawalId} LIMIT 1
  `;
  if (!row) throw new Error("Withdrawal not found");

  const wr = row as { id: number; rider_id: number; status: string; amount: string };
  const status = String(wr.status ?? "");
  if (["completed", "failed", "cancelled"].includes(status)) {
    throw new Error(`Cannot reject withdrawal in status: ${status}`);
  }

  const riderId = Number(wr.rider_id);
  const amount = round2(Number(wr.amount));

  await sql`
    UPDATE withdrawal_requests
    SET
      status = 'failed',
      failure_reason = ${reason.trim() || "Rejected by admin"},
      processed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${withdrawalId}
  `;

  await revertRiderWithdrawalWalletDebit(riderId, withdrawalId, amount, reason);

  try {
    await sql`
      UPDATE payment_payout_approvals
      SET
        status = 'FAILED',
        rejected_by_system_user_id = ${systemUserId},
        rejection_reason = ${reason.trim() || "Rejected by admin"},
        updated_at = NOW()
      WHERE payout_request_id = ${withdrawalId} AND payout_type = 'RIDER'
    `;
  } catch {
    /* optional */
  }
}

export async function updateRiderWithdrawalPgOrUtr(
  withdrawalId: number,
  field: "pg" | "utr",
  value: string,
): Promise<void> {
  const sql = getSql();
  const trimmed = value.trim();
  if (field === "pg") {
    if (!trimmed) throw new Error("PG transaction ID is required");
    await sql`
      UPDATE withdrawal_requests
      SET transaction_id = ${trimmed}, updated_at = NOW()
      WHERE id = ${withdrawalId}
    `;
    try {
      await sql`
        UPDATE payment_payout_approvals
        SET gateway_payout_id = ${trimmed}, updated_at = NOW()
        WHERE payout_request_id = ${withdrawalId} AND payout_type = 'RIDER'
      `;
    } catch {
      /* optional */
    }
    return;
  }

  try {
    await sql`
      UPDATE payment_payout_approvals
      SET utr_reference = ${trimmed || null}, updated_at = NOW()
      WHERE payout_request_id = ${withdrawalId} AND payout_type = 'RIDER'
    `;
  } catch {
    /* optional */
  }
}
