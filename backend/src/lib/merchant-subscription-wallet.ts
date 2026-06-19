/**
 * Merchant subscription wallet debits — auto-renew from merchant_wallet.
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
}): Promise<{ ledgerId: number }> {
  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    throw new Error("subscription amount must be positive");
  }

  const sql = getSql();
  const wallet = await getOrCreateWallet(args.storeId);
  const walletId = wallet.id;
  const key = idempotencyKey(
    "merchant_sub_renew",
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
      ${JSON.stringify(args.metadata ?? {})}::jsonb
    ) AS ledger_id
  `;

  return { ledgerId: Number((row as { ledger_id: number }).ledger_id) };
}

export function isInsufficientMerchantWalletError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err ?? "");
  return /insufficient available balance/i.test(msg);
}
