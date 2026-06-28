import type { Sql } from "postgres";
import type { CheckoutGatiCashAdjustments } from "./checkout-gaticash-adjustments.js";

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

/** Debit GatiCash applied at checkout and credit missed-offer wallet add after order is placed. Idempotent by order id. */
/** Debit GatiCash toward post-delivery ride fare payment. Idempotent by order id. */
export async function debitCustomerGatiCashForRideFare(
  sql: Sql,
  args: {
    customerInternalId: number;
    orderIdText: string;
    amount: number;
  }
): Promise<void> {
  const amount = Math.round((Number(args.amount) || 0) * 100) / 100;
  if (amount <= 0.005) return;

  await ensureCustomerWallet(sql, args.customerInternalId);
  const debitKey = `ride_gaticash_${args.orderIdText}`.slice(0, 120);
  const existingDebit = await sql`
    SELECT id FROM public.customer_wallet_transactions
    WHERE transaction_id = ${debitKey}
    LIMIT 1
  `;
  if (existingDebit.length > 0) return;

  await sql`
    SELECT public.customer_wallet_debit(
      ${args.customerInternalId},
      ${amount},
      'DEBIT'::public.wallet_transaction_type,
      ${args.orderIdText},
      ${"ride_fare_payment"},
      ${"GatiCash applied on ride fare"},
      ${debitKey},
      ${JSON.stringify({ orderId: args.orderIdText })}::jsonb,
      FALSE
    )
  `;
}

export async function fulfillCheckoutGatiCashWalletOps(
  sql: Sql,
  args: {
    customerInternalId: number;
    orderIdText: string;
    merchantStoreId: number;
    adjustments: CheckoutGatiCashAdjustments;
  }
): Promise<void> {
  const { customerInternalId, orderIdText, merchantStoreId, adjustments } = args;
  if (adjustments.gatiCashApplied <= 0 && adjustments.missedOfferWalletAdd <= 0) return;

  await ensureCustomerWallet(sql, customerInternalId);

  if (adjustments.gatiCashApplied > 0) {
    const debitKey = `order_gaticash_${orderIdText}`.slice(0, 120);
    const existingDebit = await sql`
      SELECT id FROM public.customer_wallet_transactions
      WHERE transaction_id = ${debitKey}
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
          ${debitKey},
          ${JSON.stringify({ orderId: orderIdText, merchantStoreId })}::jsonb,
          FALSE
        )
      `;
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
          })}::jsonb,
          'BONUS'::public.customer_wallet_balance_lot_type,
          ${null}
        )
      `;
    }
  }
}
