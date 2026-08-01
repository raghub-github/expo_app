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
  // Pre-accept (restaurant has not accepted yet) — distinct from generic pre-pickup.
  if (
    prev === "CREATED" ||
    prev === "NEW" ||
    prev === "PLACED" ||
    prev === "ORDER_PLACED" ||
    prev === "ORDER_RECEIVED"
  ) {
    return { orderMilestone: "ORDER_CREATED", cancelledBy };
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
    amounts: amountsRaw,
    raw,
  };
}

export type EnginePreviewDisplay = {
  ok: boolean;
  rule_code: string | null;
  execution_status: string | null;
  amounts: Record<string, unknown> | null;
  error: string | null;
  simulated: boolean;
  scenario?: string;
  order_milestone?: string;
  engine?: string;
};

export function formatEnginePreviewStatus(status: string | null | undefined): string {
  if (!status) return "Unknown";
  const labels: Record<string, string> = {
    APPROVAL_REQUIRED: "Approval required",
    SIMULATED: "Simulated preview",
    COMPLETED: "Will apply on submit",
    NO_RULE: "No matching rule",
    FAILED: "Failed",
    UNAVAILABLE: "Unavailable",
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

export function formatEnginePreviewError(error: string | null | undefined): string {
  if (!error) return "";
  const labels: Record<string, string> = {
    no_rule_engine: "Financial rule engine is not configured in this environment.",
    no_matching_rule: "No active financial rule matches this order scenario, stage, and cancellation reason.",
    empty_result: "Rule engine returned an empty result.",
    payment_engine_not_migrated: "Legacy payment engine is not available.",
    invalid_order_gross: "Invalid order amount for rule calculation.",
  };
  return labels[error] ?? error.replace(/_/g, " ");
}

/** Normalize gm_execute_rule / simulate output for dashboard preview UI. */
export function normalizeEnginePreviewDisplay(
  result: FinancialRuleExecutionResult,
  extras?: { scenario?: string; orderMilestone?: string }
): EnginePreviewDisplay {
  const raw = (result.raw ?? {}) as Record<string, unknown>;
  const ok = Boolean(raw.ok ?? result.ok ?? result.applied);
  const ruleCode =
    (typeof raw.rule_code === "string" ? raw.rule_code : null) ?? result.ruleCode ?? null;

  let executionStatus =
    (typeof raw.execution_status === "string" ? raw.execution_status : null) ??
    result.executionStatus ??
    null;

  if (!executionStatus) {
    if (raw.approval_required === true) executionStatus = "APPROVAL_REQUIRED";
    else if (raw.simulated === true && ok) executionStatus = "SIMULATED";
    else if (ok) executionStatus = "COMPLETED";
    else if (result.error || raw.reason) executionStatus = ruleCode ? "FAILED" : "NO_RULE";
  }

  const amounts =
    raw.amounts && typeof raw.amounts === "object"
      ? (raw.amounts as Record<string, unknown>)
      : result.amounts
        ? (result.amounts as unknown as Record<string, unknown>)
        : null;

  const error =
    result.error ??
    (typeof raw.reason === "string" ? raw.reason : null) ??
    (!ok && !ruleCode ? "no_matching_rule" : null);

  return {
    ok,
    rule_code: ruleCode,
    execution_status: executionStatus,
    amounts,
    error,
    simulated: Boolean(raw.simulated),
    scenario: extras?.scenario,
    order_milestone: extras?.orderMilestone,
    engine: (typeof raw.engine === "string" ? raw.engine : undefined) ?? result.engine,
  };
}

export function buildIdempotencyKey(prefix: string, parts: (string | number | null | undefined)[]): string {
  return `${prefix}:${parts.filter((p) => p != null && p !== "").join(":")}`;
}
