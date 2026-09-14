export type FinancialRuleScenario = "CANCELLATION" | "POST_DELIVERY_CANCELLATION" | "PARTIAL_REFUND" | "RTO" | "COD_FAILURE" | "CHARGEBACK" | "COMPENSATION" | "DISPUTE_RESOLUTION";
export type TriggeredBy = "CUSTOMER" | "MERCHANT" | "RIDER" | "ADMIN" | "SYSTEM" | "PLATFORM";
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
export declare function mapActorToTriggeredBy(actorType: string): TriggeredBy;
export declare function resolvePaymentCancellationMilestone(input: {
    previousStatus: string;
    cancelledByType: string;
    wasDelivered?: boolean;
}): {
    orderMilestone: string;
    cancelledBy: TriggeredBy | null;
};
export declare function scenarioForOrderStatus(status: string): FinancialRuleScenario;
export declare function refundFieldsFromEngineResult(result: Record<string, unknown> | undefined): {
    refundStatus: string;
    refundAmount: number | null;
};
export declare function parseEngineResult(raw: Record<string, unknown> | undefined): FinancialRuleExecutionResult;
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
export declare function formatEnginePreviewStatus(status: string | null | undefined): string;
export declare function formatEnginePreviewError(error: string | null | undefined): string;
/** Normalize gm_execute_rule / simulate output for dashboard preview UI. */
export declare function normalizeEnginePreviewDisplay(result: FinancialRuleExecutionResult, extras?: {
    scenario?: string;
    orderMilestone?: string;
}): EnginePreviewDisplay;
export declare function buildIdempotencyKey(prefix: string, parts: (string | number | null | undefined)[]): string;
export type CancellationSlab = {
    slabNumber: number;
    /** Inclusive lower bound of cumulative accepted orders (>= 1). */
    minAccepted: number;
    /** Inclusive upper bound, or null for an open-ended top slab ("and above"). */
    maxAccepted: number | null;
    /** false = grace slab (rate shown, never blocks). */
    blockingEnabled: boolean;
    /** Rider-fault % that triggers a block when blockingEnabled (0..100). */
    thresholdPct: number;
};
export type CancellationSlabPolicy = {
    enabled: boolean;
    policyVersion: number;
    slabs: CancellationSlab[];
};
export type SlabEvaluationReason = "policy_disabled" | "no_accepted_orders" | "no_matching_slab" | "grace_slab" | "no_rider_fault" | "below_threshold" | "threshold_reached";
export type SlabEvaluation = {
    accepted: number;
    riderFault: number;
    /** Display rate (full precision, NOT used for the decision). */
    ratePct: number;
    currentSlab: CancellationSlab | null;
    thresholdPct: number | null;
    blockingEnabled: boolean;
    shouldBlock: boolean;
    reason: SlabEvaluationReason;
};
/** Display-only rate; the block decision never uses this rounded/float value. */
export declare function cancellationRatePct(accepted: number, riderFault: number): number;
/** The slab whose [minAccepted, maxAccepted] contains `accepted` (max null = ∞). */
export declare function selectCancellationSlab(slabs: CancellationSlab[], accepted: number): CancellationSlab | null;
/**
 * Authoritative evaluation. Integer/rational comparison only:
 *   rate >= threshold  <=>  riderFault/accepted >= thresholdPct/100
 *                      <=>  riderFault * 10000 >= round(thresholdPct*100) * accepted
 * so 60.00% is exactly 60%, and 7/11 is compared as a true ratio (never 63.64%).
 */
export declare function evaluateCancellationSlabPolicy(input: {
    enabled: boolean;
    slabs: CancellationSlab[];
    accepted: number;
    riderFault: number;
}): SlabEvaluation;
/**
 * Validate an admin-edited slab set for one service. Returns human-readable
 * errors ([] = valid). Enforces: >=1 slab; positive contiguous ranges starting
 * at 1 with no gaps/overlaps; only the last slab may be open-ended; thresholds
 * within 0..100; unique ascending slab numbers.
 */
export declare function validateCancellationSlabs(slabs: CancellationSlab[]): string[];
/** Reference defaults (seeded by migration): grace 1–5, then 60% / 35% / 20% (top open-ended). */
export declare const DEFAULT_CANCELLATION_SLABS: CancellationSlab[];
//# sourceMappingURL=index.d.ts.map