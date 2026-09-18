import "server-only";

import { getSql, num, str, withPgRetry } from "@/lib/db/client";

export type CustomerWalletCreditResult = {
  customerId: string;
  internalId: number;
  amount: number;
  balanceAfter: number;
  ledgerTitle: string;
  transactionId: string;
  ledgerId: number | null;
};

export type CustomerWalletLimits = {
  customerId: string;
  internalId: number;
  balance: number;
  maxBalance: number;
  remaining: number;
};

const DEFAULT_MAX_BALANCE = 50_000;

function inr(amount: number, fractionDigits = 2): string {
  return amount.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: fractionDigits,
  });
}

export async function getCustomerWalletLimits(customerIdRaw: string): Promise<CustomerWalletLimits> {
  const sql = getSql();
  const customerKey = str(customerIdRaw).trim();
  if (!customerKey) throw new Error("Invalid customer id");

  const rows = await withPgRetry(
    () =>
      sql<{ id: number; customer_id: string; balance: number | string; max_balance: number | string | null }[]>`
        SELECT
          c.id,
          c.customer_id,
          COALESCE(
            (SELECT w.current_balance FROM customer_wallet w WHERE w.customer_id = c.id LIMIT 1),
            c.wallet_balance,
            0
          ) AS balance,
          COALESCE(
            (SELECT w.max_balance FROM customer_wallet w WHERE w.customer_id = c.id LIMIT 1),
            ${DEFAULT_MAX_BALANCE}
          ) AS max_balance
        FROM customers c
        WHERE c.deleted_at IS NULL
          AND (c.customer_id = ${customerKey} OR c.id::text = ${customerKey})
        LIMIT 1
      `,
    "wallet-limits"
  );
  const row = rows[0];
  if (!row) throw new Error("Customer not found");
  const balance = num(row.balance);
  const maxBalance = Math.max(num(row.max_balance) || DEFAULT_MAX_BALANCE, 0);
  const remaining = Math.max(0, Math.round((maxBalance - balance) * 100) / 100);
  return {
    customerId: String(row.customer_id),
    internalId: Number(row.id),
    balance,
    maxBalance,
    remaining,
  };
}

export function assertWalletCreditWithinLimit(amount: number, limits: CustomerWalletLimits): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }
  if (limits.remaining <= 0) {
    throw new Error(`Wallet is at max limit (${inr(limits.maxBalance, 0)}). No more credit allowed.`);
  }
  if (amount > limits.remaining + 1e-9) {
    throw new Error(
      `Limit crossed — max add allowed is ${inr(limits.remaining)} (max ${inr(limits.maxBalance, 0)}, current ${inr(limits.balance)})`
    );
  }
}

/**
 * Credit GatiCash via public.customer_wallet_credit.
 * `comment` is stored as transaction description and becomes the customer-app ledger title.
 */
export async function creditCustomerWallet(opts: {
  customerIdRaw: string;
  amount: number;
  comment: string;
  adminSystemUserId: number;
  adminEmail?: string | null;
}): Promise<CustomerWalletCreditResult> {
  const sql = getSql();
  const customerKey = str(opts.customerIdRaw).trim();
  const amount = Number(opts.amount);
  const comment = str(opts.comment).trim();

  if (!customerKey) throw new Error("Invalid customer id");
  if (!comment) throw new Error("Ledger comment is required");
  if (comment.length > 200) throw new Error("Comment must be 200 characters or less");

  const limits = await getCustomerWalletLimits(customerKey);
  assertWalletCreditWithinLimit(amount, limits);

  const internalId = limits.internalId;
  const publicId = limits.customerId;
  const idempotencyKey = `coredash_admin_credit_${internalId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const metadata = {
    source: "coredash",
    adminSystemUserId: opts.adminSystemUserId,
    adminEmail: opts.adminEmail ?? null,
    ledgerTitle: comment,
  };

  const creditRows = await withPgRetry(
    () =>
      sql<{ tx_id: number | string }[]>`
        SELECT public.customer_wallet_credit(
          ${internalId},
          ${amount},
          'BONUS'::public.wallet_transaction_type,
          ${`coredash:${opts.adminSystemUserId}`},
          ${"coredash_admin_credit"},
          ${comment},
          NULL,
          ${idempotencyKey},
          ${JSON.stringify(metadata)}::text::jsonb,
          'BONUS'::public.customer_wallet_balance_lot_type,
          ${null}
        ) AS tx_id
      `,
    "wallet-credit-fn"
  );

  if (!creditRows[0]?.tx_id) {
    throw new Error("Wallet credit failed");
  }

  const balanceRows = await withPgRetry(
    () =>
      sql<{ current_balance: number | string }[]>`
        SELECT COALESCE(current_balance, 0) AS current_balance
        FROM customer_wallet
        WHERE customer_id = ${internalId}
        LIMIT 1
      `,
    "wallet-credit-balance"
  );

  return {
    customerId: publicId,
    internalId,
    amount,
    balanceAfter: num(balanceRows[0]?.current_balance),
    ledgerTitle: comment,
    transactionId: idempotencyKey,
    ledgerId: Number(creditRows[0].tx_id),
  };
}
