import "server-only";

import { getSql, num, str, withPgRetry } from "@/lib/db/client";

export type CustomerWalletLedgerEntry = {
  id: string;
  transactionId: string;
  type: string;
  title: string;
  description: string | null;
  amount: number;
  balanceAfter: number | null;
  referenceType: string | null;
  formattedOrderId: string | null;
  status: string | null;
  createdAt: string;
};

function ledgerTitle(dbType: string, description: string | null, referenceType: string | null): string {
  if (referenceType === "missed_offer_compensation") return "Unlocked offer Credit";
  const t = dbType.toUpperCase();
  if (t === "REFUND" || referenceType === "order_refund") return "GatiCash Refunded - Credit Wallet";
  const desc = description?.trim();
  if (desc) return desc;
  if (t === "TOPUP") return "GatiCash top-up";
  if (t === "DEBIT") return "Order debit";
  if (t === "BONUS") return "Bonus credited";
  if (t === "CASHBACK") return "Cashback";
  if (t === "REVERSAL") return "Reversal";
  return dbType || "Wallet entry";
}

function isDebitType(dbType: string, description: string | null): boolean {
  const t = dbType.toUpperCase();
  const desc = (description ?? "").toLowerCase();
  if (desc.includes("expired")) return true;
  return t === "DEBIT";
}

export async function fetchCustomerWalletLedger(
  customerIdRaw: string,
  limitRaw?: number
): Promise<{ entries: CustomerWalletLedgerEntry[]; balance: number }> {
  const sql = getSql();
  const customerKey = str(customerIdRaw).trim();
  if (!customerKey) throw new Error("Invalid customer id");
  const limit = Math.min(Math.max(Number(limitRaw) || 50, 1), 100);

  const profile = await withPgRetry(
    () =>
      sql<{ id: number; wallet: number | string }[]>`
        SELECT
          c.id,
          COALESCE(
            (SELECT w.current_balance FROM customer_wallet w WHERE w.customer_id = c.id LIMIT 1),
            c.wallet_balance,
            0
          ) AS wallet
        FROM customers c
        WHERE c.deleted_at IS NULL
          AND (c.customer_id = ${customerKey} OR c.id::text = ${customerKey})
        LIMIT 1
      `,
    "wallet-ledger-resolve"
  );
  const row = profile[0];
  if (!row) throw new Error("Customer not found");
  const internalId = Number(row.id);

  const txRows = await withPgRetry(
    () =>
      sql<
        {
          id: number | string;
          transaction_id: string | null;
          transaction_type: string;
          amount: number | string;
          balance_after: number | string | null;
          reference_type: string | null;
          description: string | null;
          status: string | null;
          created_at: Date | string;
          formatted_order_id: string | null;
        }[]
      >`
        SELECT
          cwt.id,
          cwt.transaction_id,
          cwt.transaction_type::text AS transaction_type,
          cwt.amount,
          cwt.balance_after,
          cwt.reference_type,
          cwt.description,
          cwt.status::text AS status,
          cwt.created_at,
          COALESCE(
            NULLIF(BTRIM(o.formatted_order_id), ''),
            NULLIF(BTRIM(o.order_id), ''),
            CASE
              WHEN cwt.reference_id ~* '^GM[A-Z]?[0-9]+'
                THEN cwt.reference_id
              ELSE NULL
            END
          ) AS formatted_order_id
        FROM customer_wallet_transactions cwt
        LEFT JOIN LATERAL (
          SELECT formatted_order_id, order_id
          FROM orders_core
          WHERE cwt.reference_id IS NOT NULL
            AND BTRIM(cwt.reference_id) <> ''
            AND (
              order_id = cwt.reference_id
              OR formatted_order_id = cwt.reference_id
              OR id::text = cwt.reference_id
            )
          ORDER BY id DESC
          LIMIT 1
        ) o ON TRUE
        WHERE cwt.customer_id = ${internalId}
        ORDER BY cwt.created_at DESC
        LIMIT ${limit}
      `,
    "wallet-ledger-list"
  );

  return {
    balance: num(row.wallet),
    entries: txRows.map((tx) => {
      const dbType = String(tx.transaction_type ?? "CREDIT");
      const description = tx.description != null ? String(tx.description) : null;
      const referenceType = tx.reference_type != null ? String(tx.reference_type) : null;
      const rawAmount = num(tx.amount);
      const signed = isDebitType(dbType, description) ? -Math.abs(rawAmount) : Math.abs(rawAmount);
      const formattedOrderId =
        tx.formatted_order_id != null && String(tx.formatted_order_id).trim()
          ? String(tx.formatted_order_id).trim()
          : null;
      return {
        id: String(tx.id),
        transactionId: String(tx.transaction_id ?? tx.id),
        type: dbType,
        title: ledgerTitle(dbType, description, referenceType),
        description,
        amount: signed,
        balanceAfter: tx.balance_after != null ? num(tx.balance_after) : null,
        referenceType,
        formattedOrderId,
        status: tx.status != null ? String(tx.status) : null,
        createdAt: new Date(String(tx.created_at)).toISOString(),
      };
    }),
  };
}
