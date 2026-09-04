/**
 * Pure Merchant Debit / CTM adjustment math (no DB).
 * Used by dashboard + tests; keep in sync with backend resolveMerchantCtmDebitAdjustment.
 */

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

export type MerchantCtmDebitAdjustment =
  | {
      kind: "none";
      amount: number;
      ctmAmount: number;
      currentNetHeld: number;
      targetNet: number;
      keepPct: number;
      ctmAlreadyCredited: boolean;
      reason: string;
      adjustmentType: "NONE";
    }
  | {
      kind: "credit";
      amount: number;
      ctmAmount: number;
      currentNetHeld: number;
      targetNet: number;
      keepPct: number;
      ctmAlreadyCredited: boolean;
      reason: string;
      transactionType: "COMPENSATION_CREDIT";
      adjustmentType: "CREDIT";
    }
  | {
      kind: "debit";
      amount: number;
      ctmAmount: number;
      currentNetHeld: number;
      targetNet: number;
      keepPct: number;
      ctmAlreadyCredited: boolean;
      reason: string;
      transactionType: "COMPENSATION_RECOVERY";
      adjustmentType: "DEBIT";
    };

export const COMPENSATION_CREDIT_REASON = "Admin Cancellation Compensation";
export const COMPENSATION_RECOVERY_REASON = "Admin Cancellation Recovery";

export function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round2(n: number): number {
  return roundMoney2(n);
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

export function merchantDebitKeepPct(mode: MerchantDebitMode): number {
  switch (mode) {
    case "full_debit":
      return 0;
    case "partial_debit":
      return 50;
    case "no_debit":
      return 100;
  }
}

export function resolveCancellationPayoutScenario(
  hasOrderPayout: boolean
): CancellationPayoutScenario {
  return hasOrderPayout ? "ALREADY_CREDITED" : "NOT_CREDITED";
}

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

export function isNoDebitMerchantMode(
  mode: string | null | undefined
): boolean {
  return normalizeMerchantDebitMode(mode) === "no_debit";
}

export function resolveMerchantCtmDebitAdjustment(args: {
  mode: MerchantDebitMode;
  ctmAmount: number;
  currentNetHeld: number;
  grossCredited?: number;
}): MerchantCtmDebitAdjustment {
  const ctmAmount = round2(Math.max(0, args.ctmAmount));
  const currentNetHeld = round2(Math.max(0, args.currentNetHeld));
  const grossCredited = round2(
    Math.max(0, args.grossCredited ?? args.currentNetHeld)
  );
  const keepPct = merchantDebitKeepPct(args.mode);
  const targetNet = round2((ctmAmount * keepPct) / 100);
  const delta = round2(targetNet - currentNetHeld);
  const ctmAlreadyCredited = grossCredited > 0.009;

  if (!(ctmAmount > 0) || Math.abs(delta) <= 0.009) {
    return {
      kind: "none",
      amount: 0,
      ctmAmount,
      currentNetHeld,
      targetNet,
      keepPct,
      ctmAlreadyCredited,
      reason:
        args.mode === "no_debit"
          ? COMPENSATION_CREDIT_REASON
          : COMPENSATION_RECOVERY_REASON,
      adjustmentType: "NONE",
    };
  }

  if (delta > 0) {
    return {
      kind: "credit",
      amount: delta,
      ctmAmount,
      currentNetHeld,
      targetNet,
      keepPct,
      ctmAlreadyCredited,
      reason: COMPENSATION_CREDIT_REASON,
      transactionType: "COMPENSATION_CREDIT",
      adjustmentType: "CREDIT",
    };
  }

  return {
    kind: "debit",
    amount: round2(-delta),
    ctmAmount,
    currentNetHeld,
    targetNet,
    keepPct,
    ctmAlreadyCredited,
    reason: COMPENSATION_RECOVERY_REASON,
    transactionType: "COMPENSATION_RECOVERY",
    adjustmentType: "DEBIT",
  };
}

export function merchantCtmAdjustmentIdempotencyKey(
  orderCoreId: number,
  direction: "credit" | "debit",
  targetNet: number
): string {
  return `merchant_ctm_adj:${orderCoreId}:${direction}:${round2(targetNet).toFixed(2)}`;
}

export function resolveAdminCancellationWalletAction(
  mode: MerchantDebitMode,
  scenario: CancellationPayoutScenario,
  eligibleAmount: number
): CancellationWalletAction {
  const eligible = round2(Math.max(0, eligibleAmount));
  const currentNetHeld = scenario === "ALREADY_CREDITED" ? eligible : 0;
  const adj = resolveMerchantCtmDebitAdjustment({
    mode,
    ctmAmount: eligible,
    currentNetHeld,
    grossCredited: scenario === "ALREADY_CREDITED" ? eligible : 0,
  });

  if (adj.kind === "credit") {
    return {
      kind: "credit",
      amount: adj.amount,
      compensationPct: adj.keepPct,
      reason: adj.reason,
      transactionType: "COMPENSATION_CREDIT",
    };
  }
  if (adj.kind === "debit") {
    return {
      kind: "debit",
      amount: adj.amount,
      compensationPct: round2(100 - adj.keepPct),
      reason: adj.reason,
      transactionType: "COMPENSATION_RECOVERY",
    };
  }
  return {
    kind: "info",
    amount: 0,
    compensationPct: adj.keepPct,
    reason: adj.reason,
    transactionType: "CANCELLATION_INFO",
  };
}

export function adminCancellationLedgerMetadata(args: {
  action: CancellationWalletAction | MerchantCtmDebitAdjustment;
  mode: MerchantDebitMode;
  scenario: CancellationPayoutScenario;
  orderCoreId: number;
  eligibleAmount: number;
  source: string;
  actorSystemUserId?: number | null;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const kind = args.action.kind;
  const amount = "amount" in args.action ? Number(args.action.amount) : 0;
  const keepPct =
    "keepPct" in args.action && typeof args.action.keepPct === "number"
      ? args.action.keepPct
      : "compensationPct" in args.action
        ? Number(args.action.compensationPct)
        : merchantDebitKeepPct(args.mode);

  return {
    orders_core_id: args.orderCoreId,
    entry_type: "order_cancellation",
    balance_impact:
      kind === "credit" ? "credit" : kind === "debit" ? "debit" : "none",
    admin_override: true,
    merchant_debit_mode: args.mode,
    compensation_scenario: args.scenario,
    compensation_pct: keepPct,
    merchant_keeps_amount:
      kind === "credit"
        ? amount
        : args.mode === "no_debit"
          ? args.eligibleAmount
          : 0,
    clawback_amount: kind === "debit" ? amount : 0,
    net_order_value: args.eligibleAmount,
    transaction_type:
      "transactionType" in args.action
        ? args.action.transactionType
        : kind === "credit"
          ? "COMPENSATION_CREDIT"
          : kind === "debit"
            ? "COMPENSATION_RECOVERY"
            : "CANCELLATION_INFO",
    reason:
      "reason" in args.action && typeof args.action.reason === "string"
        ? args.action.reason
        : COMPENSATION_CREDIT_REASON,
    trigger_source: args.source,
    actor_system_user_id: args.actorSystemUserId ?? null,
    fulfillment_status: "REJECTED",
    order_status: "CANCELLED",
    ...(args.extra ?? {}),
  };
}
