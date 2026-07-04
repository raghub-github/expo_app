/**
 * Admin cancellation wallet actions — Scenario A (not yet credited) vs B (already credited).
 * Keep in sync with dashboard/src/lib/merchant-cancellation-wallet-action.ts
 * and partnersite/src/lib/merchant-cancellation-wallet-action.ts
 */
import type { Sql } from "postgres";

export type MerchantDebitMode = "full_debit" | "partial_debit" | "no_debit";

export type CancellationPayoutScenario = "NOT_CREDITED" | "ALREADY_CREDITED";

export type CancellationWalletAction =
  | {
      kind: "credit";
      amount: number;
      compensationPct: number;
      reason: string;
      transactionType: "COMPENSATION_CREDIT";
    }
  | {
      kind: "debit";
      amount: number;
      compensationPct: number;
      reason: string;
      transactionType: "COMPENSATION_RECOVERY";
    }
  | {
      kind: "info";
      amount: number;
      compensationPct: number;
      reason: string;
      transactionType: "CANCELLATION_INFO";
    };

export const COMPENSATION_CREDIT_REASON = "Admin Cancellation Compensation";
export const COMPENSATION_RECOVERY_REASON = "Admin Cancellation Recovery";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizeMerchantDebitMode(
  raw: string | null | undefined
): MerchantDebitMode | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "full_debit" || v === "partial_debit" || v === "no_debit") return v;
  return null;
}

export function resolveCancellationPayoutScenario(
  hasOrderPayout: boolean
): CancellationPayoutScenario {
  return hasOrderPayout ? "ALREADY_CREDITED" : "NOT_CREDITED";
}

/** Map admin debit selection to compensation/recovery percentage per PRD. */
export function adminDebitToCompensationPct(
  mode: MerchantDebitMode,
  scenario: CancellationPayoutScenario
): number {
  if (scenario === "NOT_CREDITED") {
    switch (mode) {
      case "full_debit":
        return 0;
      case "partial_debit":
        return 50;
      case "no_debit":
        return 100;
    }
  }
  switch (mode) {
    case "full_debit":
      return 100;
    case "partial_debit":
      return 50;
    case "no_debit":
      return 0;
  }
}

export function resolveAdminCancellationWalletAction(
  mode: MerchantDebitMode,
  scenario: CancellationPayoutScenario,
  eligibleAmount: number
): CancellationWalletAction {
  const eligible = round2(Math.max(0, eligibleAmount));
  const pct = adminDebitToCompensationPct(mode, scenario);
  const amount = round2((eligible * pct) / 100);

  if (scenario === "NOT_CREDITED") {
    if (amount > 0) {
      return {
        kind: "credit",
        amount,
        compensationPct: pct,
        reason: COMPENSATION_CREDIT_REASON,
        transactionType: "COMPENSATION_CREDIT",
      };
    }
    return {
      kind: "info",
      amount: eligible,
      compensationPct: 0,
      reason: COMPENSATION_CREDIT_REASON,
      transactionType: "CANCELLATION_INFO",
    };
  }

  if (amount > 0) {
    return {
      kind: "debit",
      amount,
      compensationPct: pct,
      reason: COMPENSATION_RECOVERY_REASON,
      transactionType: "COMPENSATION_RECOVERY",
    };
  }
  return {
    kind: "info",
    amount: eligible,
    compensationPct: 0,
    reason: COMPENSATION_RECOVERY_REASON,
    transactionType: "CANCELLATION_INFO",
  };
}

export function adminCancellationLedgerMetadata(args: {
  action: CancellationWalletAction;
  mode: MerchantDebitMode;
  scenario: CancellationPayoutScenario;
  orderCoreId: number;
  eligibleAmount: number;
  source: string;
  actorSystemUserId?: number | null;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    orders_core_id: args.orderCoreId,
    entry_type: "order_cancellation",
    balance_impact:
      args.action.kind === "credit"
        ? "credit"
        : args.action.kind === "debit"
          ? "debit"
          : "none",
    admin_override: true,
    merchant_debit_mode: args.mode,
    compensation_scenario: args.scenario,
    compensation_pct: args.action.compensationPct,
    merchant_keeps_amount:
      args.action.kind === "credit" ? args.action.amount : 0,
    clawback_amount: args.action.kind === "debit" ? args.action.amount : 0,
    net_order_value: args.eligibleAmount,
    transaction_type: args.action.transactionType,
    reason: args.action.reason,
    trigger_source: args.source,
    actor_system_user_id: args.actorSystemUserId ?? null,
    fulfillment_status: "REJECTED",
    order_status: "CANCELLED",
    ...(args.extra ?? {}),
  };
}

/** True when merchant ORDER_EARNING (or settlement credit) exists for this order. */
export async function orderHasPayoutCredited(
  sql: Sql,
  walletId: number,
  ordersFoodId: number,
  orderCoreId: number
): Promise<boolean> {
  const rows = await sql<{ found: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM merchant_wallet_ledger
      WHERE wallet_id = ${walletId}
        AND reference_type = 'ORDER'::wallet_reference_type
        AND (
          reference_id = ${ordersFoodId}
          OR idempotency_key = ${`order_earning_${ordersFoodId}`}
          OR idempotency_key = ${`settle:order:${orderCoreId}`}
          OR (metadata->>'orders_core_id')::bigint = ${orderCoreId}
        )
        AND direction = 'CREDIT'
        AND category = 'ORDER_EARNING'::wallet_transaction_category
    ) AS found
  `;
  return Boolean(rows[0]?.found);
}
