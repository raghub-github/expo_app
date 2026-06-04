export type FinancialRuleScenario =
  | "CANCELLATION"
  | "POST_DELIVERY_CANCELLATION"
  | "PARTIAL_REFUND"
  | "RTO"
  | "COD_FAILURE"
  | "CHARGEBACK"
  | "COMPENSATION"
  | "DISPUTE_RESOLUTION";

export type TriggeredBy =
  | "CUSTOMER"
  | "MERCHANT"
  | "RIDER"
  | "ADMIN"
  | "SYSTEM"
  | "PLATFORM";

export type FinancialRuleExecutionInput = {
  scenarioType: FinancialRuleScenario;
  orderCoreId: number;
  ordersFoodId?: number | null;
  coreOrderId?: string | null;
  merchantStoreId?: number | null;
  serviceType?: string;
  orderStage: string;
  triggeredBy: TriggeredBy | string;
  cancellationReasonId?: number | null;
  orderGross: number;
  actorSystemUserId?: number | null;
  idempotencyKey?: string;
  simulateOnly?: boolean;
  metadata?: Record<string, unknown>;
};

export type FinancialRulePartyAmounts = {
  refund?: number;
  compensation?: number;
  penalty?: number;
  settlement?: number;
  wallet_debit?: boolean;
  wallet_credit?: boolean;
  settlement_hold?: boolean;
  settlement_hold_hours?: number;
};

export type FinancialRuleAmounts = {
  refund: number;
  penalty: number;
  compensation: number;
  merchant_settlement: number;
  rider_settlement: number;
  customer?: FinancialRulePartyAmounts;
  merchant?: FinancialRulePartyAmounts;
  rider?: FinancialRulePartyAmounts;
  platform?: {
    liability_pct?: number;
    compensation?: number;
    absorbed_loss?: number;
    settlement_impact?: number;
    platform_bears_loss?: boolean;
  };
  order_gross?: number;
};

export type FinancialRuleReconciliationValidation = {
  ok?: boolean;
  errors?: string[];
  total_debits?: number;
  total_credits?: number;
  refund_triggered?: number;
  refund_funded?: number;
  balanced?: boolean;
};

export type FinancialRuleReconciliation = {
  plan?: Record<string, unknown>;
  validation?: FinancialRuleReconciliationValidation;
};

export type FinancialRuleExecutionResult = {
  applied: boolean;
  ok?: boolean;
  duplicate?: boolean;
  engine?: string;
  executionStatus?: string;
  error?: string;
  ruleId?: number | null;
  ruleCode?: string;
  executionLogId?: number;
  amounts?: FinancialRuleAmounts;
  reconciliation?: FinancialRuleReconciliation;
  raw?: Record<string, unknown>;
};

export function mapActorToTriggeredBy(actorType: string): TriggeredBy {
  const a = String(actorType ?? "").toLowerCase();
  if (a === "customer") return "CUSTOMER";
  if (a === "store" || a === "merchant") return "MERCHANT";
  if (a === "rider") return "RIDER";
  if (a === "admin" || a === "dashboard") return "ADMIN";
  if (a === "platform") return "PLATFORM";
  return "SYSTEM";
}

export function resolvePaymentCancellationMilestone(input: {
  previousStatus: string;
  cancelledByType: string;
  wasDelivered?: boolean;
}): { orderMilestone: string; cancelledBy: TriggeredBy | null } {
  const prev = String(input.previousStatus ?? "").toUpperCase();
  const cancelledBy = mapActorToTriggeredBy(input.cancelledByType);

  if (input.wasDelivered || prev === "DELIVERED") {
    return { orderMilestone: "CANCELLED_AFTER_DELIVERED", cancelledBy };
  }
  if (prev === "OUT_FOR_DELIVERY" || prev === "PICKED_UP" || prev === "IN_TRANSIT") {
    return { orderMilestone: "POST_PICKUP_CANCELLED", cancelledBy };
  }
  if (prev === "READY_FOR_PICKUP" || prev === "RIDER_ASSIGNED" || prev === "ASSIGNED") {
    return { orderMilestone: "RIDER_ASSIGNED", cancelledBy };
  }
  if (prev === "PREPARING" || prev === "MERCHANT_PREPARING") {
    return { orderMilestone: "MERCHANT_PREPARING", cancelledBy };
  }
  if (prev === "ACCEPTED") {
    return { orderMilestone: "ORDER_ACCEPTED", cancelledBy };
  }
  return { orderMilestone: "PRE_PICKUP_CANCELLED", cancelledBy };
}

export function scenarioForOrderStatus(status: string): FinancialRuleScenario {
  const s = String(status).toUpperCase();
  if (s === "RTO") return "RTO";
  if (s === "CANCELLED") return "CANCELLATION";
  return "CANCELLATION";
}

export function refundFieldsFromEngineResult(
  result: Record<string, unknown> | undefined
): { refundStatus: string; refundAmount: number | null } {
  if (!result?.ok) {
    return { refundStatus: "no_refund", refundAmount: null };
  }
  const amounts = result.amounts as Record<string, unknown> | undefined;
  const refund = Number(amounts?.refund ?? 0);
  const execStatus = String(result.execution_status ?? result.executionStatus ?? "");
  if (execStatus === "APPROVAL_REQUIRED") {
    return { refundStatus: "pending_approval", refundAmount: refund > 0 ? refund : null };
  }
  if (refund > 0) {
    return { refundStatus: "pending", refundAmount: refund };
  }
  return { refundStatus: "no_refund", refundAmount: null };
}

export function parseEngineResult(raw: Record<string, unknown> | undefined): FinancialRuleExecutionResult {
  if (!raw) return { applied: false, error: "empty_result" };
  const amountsRaw = raw.amounts as FinancialRuleAmounts | undefined;
  return {
    applied: Boolean(raw.ok),
    ok: Boolean(raw.ok),
    duplicate: Boolean(raw.duplicate),
    engine: raw.engine as string | undefined,
    executionStatus: (raw.execution_status ?? raw.executionStatus) as string | undefined,
    ruleId: raw.rule_id != null ? Number(raw.rule_id) : null,
    ruleCode: raw.rule_code as string | undefined,
    executionLogId: raw.execution_log_id != null ? Number(raw.execution_log_id) : undefined,
    reconciliation: raw.reconciliation as FinancialRuleReconciliation | undefined,
    raw,
  };
}

export function buildIdempotencyKey(prefix: string, parts: (string | number | null | undefined)[]): string {
  return `${prefix}:${parts.filter((p) => p != null && p !== "").join(":")}`;
}
