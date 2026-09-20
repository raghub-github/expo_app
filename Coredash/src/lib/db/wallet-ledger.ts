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

export type MerchantWalletLedgerEntry = {
  id: string;
  direction: string;
  category: string;
  title: string;
  amount: number;
  balanceAfter: number | null;
  formattedOrderId: string | null;
  status: string | null;
  createdAt: string;
};

const MERCHANT_LEDGER_LABELS: Record<string, string> = {
  ORDER_EARNING: "Order Earning",
  ORDER_ADJUSTMENT: "Adjustment",
  WITHDRAWAL: "Withdrawal",
  PENALTY: "Penalty",
  SUBSCRIPTION_FEE: "Subscription",
  COMMISSION_DEDUCTION: "Commission",
  BONUS: "Bonus",
  CASHBACK: "Cashback",
  REFUND_REVERSAL: "Refund Reversal",
  MANUAL_CREDIT: "Manual Credit",
  MANUAL_DEBIT: "Manual Debit",
  ADJUSTMENT: "Adjustment",
  ADJUSTMENT_DEBIT: "Adjustment Debit",
  ADJUSTMENT_CREDIT: "Adjustment Credit",
  COMPENSATION_CREDIT: "Compensation Credit",
  COMPENSATION_RECOVERY: "Compensation Recovery",
  FAILED_WITHDRAWAL_REVERSAL: "Withdrawal returned",
  HOLD_LOCK: "Withdrawal",
  HOLD_RELEASE: "Withdrawal update",
};

function merchantLedgerTitle(
  category: string,
  description: string | null,
  direction: string
): string {
  const desc = description?.trim();
  if (desc) return desc;
  const cat = category.toUpperCase();
  if (MERCHANT_LEDGER_LABELS[cat]) return MERCHANT_LEDGER_LABELS[cat];
  if (direction.toUpperCase() === "DEBIT") return "Debit";
  if (direction.toUpperCase() === "CREDIT") return "Credit";
  return category || "Ledger entry";
}

/** Full merchant_wallet_ledger for a store (by internal id or public store_id e.g. GMMC1026). */
export async function fetchMerchantWalletLedger(
  storeKeyRaw: string,
  limitRaw?: number
): Promise<{ entries: MerchantWalletLedgerEntry[]; balance: number; storeName: string }> {
  const sql = getSql();
  const storeKey = str(storeKeyRaw).trim();
  if (!storeKey) throw new Error("Invalid store id");
  const limit = Math.min(Math.max(Number(limitRaw) || 50, 1), 100);

  const profile = await withPgRetry(
    () =>
      sql<{ id: number; store_name: string; wallet: number | string }[]>`
        SELECT
          ms.id,
          COALESCE(NULLIF(TRIM(ms.store_display_name), ''), ms.store_name, ms.store_id) AS store_name,
          COALESCE(mw.available_balance, 0) AS wallet
        FROM merchant_stores ms
        LEFT JOIN merchant_wallet mw ON mw.merchant_store_id = ms.id
        WHERE ms.store_id = ${storeKey} OR ms.id::text = ${storeKey}
        ORDER BY CASE WHEN ms.store_id = ${storeKey} THEN 0 ELSE 1 END
        LIMIT 1
      `,
    "merchant-wallet-ledger-resolve"
  );
  const row = profile[0];
  if (!row) throw new Error("Merchant store not found");
  const storeId = Number(row.id);

  const txRows = await withPgRetry(
    () =>
      sql<
        {
          id: number | string;
          direction: string;
          category: string;
          amount: number | string;
          balance_after: number | string | null;
          description: string | null;
          status: string | null;
          created_at: Date | string;
          formatted_order_id: string | null;
        }[]
      >`
        SELECT
          l.id,
          l.direction::text AS direction,
          l.category::text AS category,
          l.amount,
          l.balance_after,
          l.description,
          l.status::text AS status,
          l.created_at,
          COALESCE(
            NULLIF(TRIM(oc.formatted_order_id), ''),
            NULLIF(TRIM(oc.order_id::text), ''),
            NULLIF(TRIM(l.metadata->>'formatted_order_id'), ''),
            CASE
              WHEN (l.metadata->>'order_id') ~ '^[0-9]+$'
                THEN 'GMF' || (l.metadata->>'order_id')
              ELSE NULL
            END
          ) AS formatted_order_id
        FROM merchant_wallet_ledger l
        JOIN merchant_wallet w ON w.id = l.wallet_id
        LEFT JOIN LATERAL (
          SELECT o.formatted_order_id, o.order_id
          FROM orders_core o
          WHERE o.merchant_store_id = ${storeId}
            AND (
              (
                (l.metadata->>'orders_core_id') ~ '^[0-9]+$'
                AND o.id = (l.metadata->>'orders_core_id')::bigint
              )
              OR (
                (l.metadata->>'order_id') ~ '^[0-9]+$'
                AND o.id = (l.metadata->>'order_id')::bigint
              )
              OR (
                UPPER(COALESCE(l.reference_type::text, '')) IN ('ORDER', 'ORDERS_CORE')
                AND l.reference_id IS NOT NULL
                AND o.id = l.reference_id
              )
            )
          ORDER BY o.id DESC
          LIMIT 1
        ) oc ON TRUE
        WHERE w.merchant_store_id = ${storeId}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ${limit}
      `,
    "merchant-wallet-ledger-list"
  );

  return {
    balance: num(row.wallet),
    storeName: String(row.store_name ?? storeKey),
    entries: txRows.map((tx) => {
      const direction = String(tx.direction ?? "CREDIT").toUpperCase();
      const category = String(tx.category ?? "");
      const description = tx.description != null ? String(tx.description) : null;
      const rawAmount = Math.abs(num(tx.amount));
      const signed = direction === "DEBIT" ? -rawAmount : rawAmount;
      const formattedOrderId =
        tx.formatted_order_id != null && String(tx.formatted_order_id).trim()
          ? String(tx.formatted_order_id).trim().replace(/^#/, "")
          : null;
      return {
        id: String(tx.id),
        direction,
        category,
        title: merchantLedgerTitle(category, description, direction),
        amount: signed,
        balanceAfter: tx.balance_after != null ? num(tx.balance_after) : null,
        formattedOrderId,
        status: tx.status != null ? String(tx.status) : null,
        createdAt: new Date(String(tx.created_at)).toISOString(),
      };
    }),
  };
}

