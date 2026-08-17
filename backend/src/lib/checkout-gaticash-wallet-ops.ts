import type { Sql } from "postgres";
import type { CheckoutGatiCashAdjustments } from "./checkout-gaticash-adjustments.js";
import {
  generateGatiCashTxnId,
  isLegacyGatiCashTxnId,
  isModernGatiCashTxnId,
  readStoredGatiCashTxnId,
} from "./gaticash-txn-id.js";

async function ensureCustomerWallet(sql: Sql, customerInternalId: number): Promise<void> {
  await sql`SELECT public.get_or_create_customer_wallet(${customerInternalId})`;
}

export async function getCustomerGatiCashAvailable(
  sql: Sql,
  customerInternalId: number
): Promise<number> {
  await ensureCustomerWallet(sql, customerInternalId);
  const rows = await sql`
    SELECT available_balance, current_balance, locked_amount
    FROM public.customer_wallet
    WHERE customer_id = ${customerInternalId}
    LIMIT 1
  `;
  const row = rows[0] as
    | { available_balance?: string | number; current_balance?: string | number; locked_amount?: string | number }
    | undefined;
  if (!row) return 0;
  const balance = Number(row.current_balance ?? 0);
  const locked = Number(row.locked_amount ?? 0);
  const available = Number(row.available_balance ?? balance - locked);
  return Math.max(0, Math.round(available * 100) / 100);
}

/**
 * Resolve the GatiCash payment txn id for an order:
 * 1) caller-provided modern id
 * 2) orders_core_payments.transaction_id / gateway_response.gatiCashTxnId
 * 3) legacy order_gaticash_* wallet row (keep for in-flight retries)
 * 4) mint a new GC-{UUID}
 */
async function resolveOrderGatiCashTxnId(
  sql: Sql,
  orderIdText: string,
  preferred?: string | null
): Promise<string> {
  const pref = preferred?.trim() || null;
  if (pref && isModernGatiCashTxnId(pref)) return pref;

  try {
    const payRows = await sql<Record<string, unknown>[]>`
      SELECT transaction_id, payment_gateway, gateway_response
      FROM public.orders_core_payments
      WHERE order_id = ${orderIdText}
      ORDER BY paid_at DESC NULLS LAST, id DESC
      LIMIT 1
    `;
    const pay = payRows[0];
    if (pay) {
      const fromResp = readStoredGatiCashTxnId(
        pay.gateway_response && typeof pay.gateway_response === "object"
          ? (pay.gateway_response as Record<string, unknown>)
          : null
      );
      if (fromResp && isModernGatiCashTxnId(fromResp)) return fromResp;
      const txn =
        typeof pay.transaction_id === "string" ? pay.transaction_id.trim() : "";
      const gw = String(pay.payment_gateway ?? "").toLowerCase();
      if (txn && (gw === "gati_cash" || gw === "wallet") && isModernGatiCashTxnId(txn)) {
        return txn;
      }
      if (txn && (gw === "gati_cash" || gw === "wallet") && isLegacyGatiCashTxnId(txn)) {
        return txn;
      }
    }
  } catch {
    /* table may be absent in older envs */
  }

  const legacyKey = `order_gaticash_${orderIdText}`.slice(0, 120);
  try {
    const legacy = await sql`
      SELECT transaction_id FROM public.customer_wallet_transactions
      WHERE transaction_id = ${legacyKey}
         OR transaction_id = ${pref ?? ""}
      LIMIT 1
    `;
    if (legacy.length > 0) {
      const tid = String((legacy[0] as { transaction_id: string }).transaction_id);
      if (tid) return tid;
    }
  } catch {
    /* ignore */
  }

  if (pref) return pref;
  return generateGatiCashTxnId();
}

/** Debit GatiCash toward post-delivery ride fare payment. Idempotent by txn id. */
export async function debitCustomerGatiCashForRideFare(
  sql: Sql,
  args: {
    customerInternalId: number;
    orderIdText: string;
    amount: number;
    /** Optional pre-issued unique GatiCash txn id. */
    gatiCashTxnId?: string | null;
  }
): Promise<string | null> {
  const amount = Math.round((Number(args.amount) || 0) * 100) / 100;
  if (amount <= 0.005) return null;

  await ensureCustomerWallet(sql, args.customerInternalId);
  const debitKey =
    (args.gatiCashTxnId && isModernGatiCashTxnId(args.gatiCashTxnId)
      ? args.gatiCashTxnId.trim()
      : null) ?? generateGatiCashTxnId();

  const existingDebit = await sql`
    SELECT id, transaction_id FROM public.customer_wallet_transactions
    WHERE transaction_id = ${debitKey}
       OR transaction_id = ${`ride_gaticash_${args.orderIdText}`.slice(0, 120)}
    LIMIT 1
  `;
  if (existingDebit.length > 0) {
    return String((existingDebit[0] as { transaction_id: string }).transaction_id);
  }

  await sql`
    SELECT public.customer_wallet_debit(
      ${args.customerInternalId},
      ${amount},
      'DEBIT'::public.wallet_transaction_type,
      ${args.orderIdText},
      ${"ride_fare_payment"},
      ${"GatiCash applied on ride fare"},
      ${debitKey},
      ${JSON.stringify({ orderId: args.orderIdText, gatiCashTxnId: debitKey })}::text::jsonb,
      FALSE
    )
  `;
  return debitKey;
}

export type FulfillCheckoutGatiCashResult = {
  gatiCashTxnId: string | null;
};

/** Debit GatiCash applied at checkout and credit missed-offer wallet add after order is placed. */
export async function fulfillCheckoutGatiCashWalletOps(
  sql: Sql,
  args: {
    customerInternalId: number;
    orderIdText: string;
    merchantStoreId: number;
    adjustments: CheckoutGatiCashAdjustments;
    /** Pre-issued unique txn id (shared with orders_core_payments.transaction_id). */
    gatiCashTxnId?: string | null;
  }
): Promise<FulfillCheckoutGatiCashResult> {
  const { customerInternalId, orderIdText, merchantStoreId, adjustments } = args;
  if (adjustments.gatiCashApplied <= 0 && adjustments.missedOfferWalletAdd <= 0) {
    return { gatiCashTxnId: null };
  }

  await ensureCustomerWallet(sql, customerInternalId);

  let gatiCashTxnId: string | null = null;

  if (adjustments.gatiCashApplied > 0) {
    gatiCashTxnId = await resolveOrderGatiCashTxnId(sql, orderIdText, args.gatiCashTxnId);
    const legacyKey = `order_gaticash_${orderIdText}`.slice(0, 120);
    const existingDebit = await sql`
      SELECT id, transaction_id FROM public.customer_wallet_transactions
      WHERE transaction_id = ${gatiCashTxnId}
         OR transaction_id = ${legacyKey}
      LIMIT 1
    `;
    if (existingDebit.length === 0) {
      await sql`
        SELECT public.customer_wallet_debit(
          ${customerInternalId},
          ${adjustments.gatiCashApplied},
          'DEBIT'::public.wallet_transaction_type,
          ${orderIdText},
          ${"food_order_checkout"},
          ${"GatiCash applied on order"},
          ${gatiCashTxnId},
          ${JSON.stringify({
            orderId: orderIdText,
            merchantStoreId,
            gatiCashTxnId,
          })}::text::jsonb,
          FALSE
        )
      `;
    } else {
      gatiCashTxnId = String(
        (existingDebit[0] as { transaction_id: string }).transaction_id
      );
    }
  }

  const comp = adjustments.missedOfferCompensation;
  if (comp && adjustments.missedOfferWalletAdd > 0) {
    const creditKey = `missed_offer_order_${orderIdText}`.slice(0, 120);
    const existingCredit = await sql`
      SELECT id FROM public.customer_wallet_transactions
      WHERE transaction_id = ${creditKey}
      LIMIT 1
    `;
    if (existingCredit.length === 0) {
      const description = comp.offerTitle?.trim() || "Offer unlocked";
      await sql`
        SELECT public.customer_wallet_credit(
          ${customerInternalId},
          ${adjustments.missedOfferWalletAdd},
          'BONUS'::public.wallet_transaction_type,
          ${comp.offerId != null ? String(comp.offerId) : comp.offerKey},
          ${"missed_offer_compensation"},
          ${description},
          NULL,
          ${creditKey},
          ${JSON.stringify({
            orderId: orderIdText,
            merchantStoreId,
            offerKey: comp.offerKey,
            offerSource: comp.offerSource ?? null,
            offerKind: comp.offerKind ?? null,
            offerTitle: description,
            source: "order_finalize",
            gatiCashTxnId,
          })}::text::jsonb,
          'BONUS'::public.customer_wallet_balance_lot_type,
          ${null}
        )
      `;
    }
  }

  return { gatiCashTxnId };
}

/** Load the original GatiCash payment txn id for an order (payment row / wallet ledger). */
export async function loadOriginalGatiCashTxnIdForOrder(
  sql: Sql,
  orderIdText: string | null | undefined
): Promise<string | null> {
  if (!orderIdText?.trim()) return null;
  const oid = orderIdText.trim();
  try {
    const payRows = await sql<Record<string, unknown>[]>`
      SELECT transaction_id, payment_gateway, gateway_response
      FROM public.orders_core_payments
      WHERE order_id = ${oid}
      ORDER BY paid_at DESC NULLS LAST, id DESC
      LIMIT 3
    `;
    for (const pay of payRows) {
      const fromResp = readStoredGatiCashTxnId(
        pay.gateway_response && typeof pay.gateway_response === "object"
          ? (pay.gateway_response as Record<string, unknown>)
          : null
      );
      if (fromResp) return fromResp;
      const txn =
        typeof pay.transaction_id === "string" ? pay.transaction_id.trim() : "";
      const gw = String(pay.payment_gateway ?? "").toLowerCase();
      if (
        txn &&
        (gw === "gati_cash" || gw === "wallet" || isModernGatiCashTxnId(txn) || isLegacyGatiCashTxnId(txn))
      ) {
        if (gw === "gati_cash" || gw === "wallet" || isModernGatiCashTxnId(txn)) {
          return txn;
        }
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const legacyKey = `order_gaticash_${oid}`.slice(0, 120);
    const rows = await sql`
      SELECT transaction_id
      FROM public.customer_wallet_transactions
      WHERE reference_id = ${oid}
        AND (
          transaction_id ILIKE 'GC-%'
          OR transaction_id = ${legacyKey}
          OR transaction_id ILIKE 'gaticash_%'
          OR transaction_id ILIKE 'order_gaticash_%'
        )
      ORDER BY created_at ASC
      LIMIT 1
    `;
    if (rows.length > 0) {
      return String((rows[0] as { transaction_id: string }).transaction_id);
    }
  } catch {
    /* ignore */
  }
  return null;
}
