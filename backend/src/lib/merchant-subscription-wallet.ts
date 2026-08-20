/**
 * Merchant subscription wallet debits — used by:
 *   - Auto-renewal cron (prefix `merchant_sub_renew`, default)
 *   - Initial purchase / upgrade from wallet (prefix `merchant_sub_purchase`,
 *     with a stable full key so double-clicks / retries within the same day
 *     dedupe correctly even before the subscription row exists).
 */

import { idempotencyKey } from "@gatimitra/contracts";
import { getSql } from "../db/client.js";
import { getOrCreateWallet } from "./merchant-wallet-engine.js";

export async function debitMerchantSubscriptionFee(args: {
  storeId: number;
  subscriptionId: number;
  amount: number;
  description: string;
  metadata?: Record<string, unknown>;
  idempotencySuffix: string | number;
  /** Prefix passed to idempotencyKey(). Defaults to "merchant_sub_renew" for backward compat. */
  idempotencyPrefix?: string;
  /**
   * Full override for the idempotency key. When set, prefix + suffix are ignored.
   * Used by the purchase-from-wallet path where the key must be stable across
   * retries that may or may not have created the subscription row yet.
   */
  idempotencyKeyOverride?: string;
}): Promise<{ ledgerId: number }> {
  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    throw new Error("subscription amount must be positive");
  }

  const sql = getSql();
  const wallet = await getOrCreateWallet(args.storeId);
  const walletId = wallet.id;
  const key =
    args.idempotencyKeyOverride ??
    idempotencyKey(
      args.idempotencyPrefix ?? "merchant_sub_renew",
      args.subscriptionId,
      args.idempotencySuffix
    );

  const existing = await sql`
    SELECT id FROM merchant_wallet_ledger
    WHERE idempotency_key = ${key}
    LIMIT 1
  `;
  if (existing.length > 0) {
    return { ledgerId: Number((existing[0] as { id: number }).id) };
  }

  const [row] = await sql`
    SELECT merchant_wallet_debit(
      ${walletId},
      ${args.amount},
      'SUBSCRIPTION_FEE'::wallet_transaction_category,
      'AVAILABLE'::wallet_balance_type,
      'SUBSCRIPTION'::wallet_reference_type,
      ${args.subscriptionId},
      ${key},
      ${args.description},
      ${JSON.stringify(args.metadata ?? {})}::text::jsonb
    ) AS ledger_id
  `;

  return { ledgerId: Number((row as { ledger_id: number }).ledger_id) };
}

export function isInsufficientMerchantWalletError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err ?? "");
  return /insufficient available balance/i.test(msg);
}

/**
 * Build the stable idempotency key used by the purchase-from-wallet path.
 * Includes the calendar date so a fresh purchase on a later day is allowed
 * even if the merchant repurchases the same plan.
 */
export function buildPurchaseFromWalletIdempotencyKey(args: {
  storeId: number;
  planId: number;
  now?: Date;
}): string {
  const d = args.now ?? new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `merchant_sub_purchase_${args.storeId}_${args.planId}_${ymd}`;
}
