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
/**
 * Decide whether cancel-time auto-refund should move money now, and how much.
 *
 * Policy:
 *  - Customer cancel → never here (customer paths use their own refund promise).
 *  - Admin rule engine amount > 0 → auto-refund that amount.
 *  - Admin rule requires approval → stamp pending_approval, do not auto-execute.
 *  - Store / merchant / system / rider cancel when engine is silent → full paid refund.
 *  - System auto-cancel (accept timeout / no rider) with force flag → same full refund.
 *  - Admin cancel with engine silent / no_refund → do not invent a refund.
 */
export type PostCancelAutoRefundPolicy = {
    shouldAutoExecute: boolean;
    /** Pass to auto-refund; null means full customer paid amount. */
    executeAmount: number | null;
    refundStatus: string;
    /** Intent amount for order_cancellation_reasons / OCR. */
    refundAmountForLedger: number | null;
    skipReason?: "customer_actor" | "pending_approval" | "admin_no_refund" | "nothing_to_refund";
};
export declare function resolvePostCancelAutoRefundPolicy(input: {
    actorRole?: string | null;
    engineRefund: {
        refundStatus: string;
        refundAmount: number | null;
    };
    orderGross?: number | null;
    /** Accept-timeout / no-rider: always refund customer even if engine stamped no_refund. */
    forceCustomerRefundWhenEngineSilent?: boolean;
}): PostCancelAutoRefundPolicy;
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
//# sourceMappingURL=index.d.ts.map