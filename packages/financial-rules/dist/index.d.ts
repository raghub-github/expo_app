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
/**
 * A rider is ACTIVE while their wallet balance is ABOVE the floor configured in
 * Super Admin → Ride Billing & Wallet → "Global block threshold"
 * (ride_wallet_config.global_block_threshold, default −₹200).
 *
 *   balance >  floor  → active (a negative balance down to the floor is allowed)
 *   balance <= floor  → every service is paused until the balance is back above it
 *
 * The per-service penalty threshold (negative usage per service) is a separate,
 * Super-Admin-configured penalty rule and is evaluated by syncNegativeWalletBlocks.
 *
 * History: migration 0649 added a positive "minimum wallet balance" (₹200,
 * enforce) for Ride + Parcel. That was wrong — riders were paused at ₹0..₹199
 * although a wallet only has to stay above −₹200. It is retired: nothing reads
 * min_wallet_balance / min_balance_mode any more, and `walletMinBalance` in API
 * responses is always the neutral status below so installed apps show nothing.
 */
export declare const DEFAULT_WALLET_ACTIVE_FLOOR = -200;
/** Signed rupees: "₹250", "-₹250", "₹199.50". */
export declare function formatSignedRupees(n: number): string;
/** The configured floor, or −₹200 when the value is missing / invalid / positive. */
export declare function normalizeWalletActiveFloor(value: unknown): number;
/** True when the wallet is at or below the floor (all services paused). */
export declare function isWalletAtOrBelowFloor(balance: number, floor: number): boolean;
/**
 * Smallest whole-rupee recharge that lifts the balance strictly above the floor
 * (0 when already above). x = ⌊floor − balance⌋ + 1 is the least integer with
 * balance + x > floor: −₹250 → ₹51 (−₹199), −₹200 → ₹1, −₹200.50 → ₹1.
 */
export declare function walletUnlockAmount(balance: number, floor: number): number;
export type WalletFloorStatus = {
    floor: number;
    balance: number;
    /** balance <= floor → every service paused. */
    blocked: boolean;
    /** Minimum whole-rupee recharge that unlocks (0 when active). */
    unlockAmount: number;
    /** Recharge that clears all dues (balance → ₹0); 0 when not negative. */
    clearDuesAmount: number;
    message: string | null;
};
export declare function evaluateWalletFloor(input: {
    balance: number;
    floor: unknown;
}): WalletFloorStatus;
export type StoredWalletBlock = {
    serviceType: string;
    reason: string;
};
/** Block reasons owned by the wallet engine (recomputed by syncNegativeWalletBlocks). */
export declare const WALLET_ENGINE_BLOCK_REASONS: readonly ["negative_wallet", "global_emergency"];
/**
 * Live wallet block state from the current balance plus the rows
 * syncNegativeWalletBlocks last wrote.
 *
 * Rows are a cache of a decision taken at the last wallet event; the balance is
 * the truth. A recharge that lifts the wallet above the floor must unblock the
 * rider at once, even if no sync has run since — so:
 *   - global: decided live from the balance (a stale global_emergency row is ignored);
 *   - negative_wallet rows: honoured while the wallet is ≤ ₹0, ignored once it is
 *     positive and auto-unblock is on (exactly when the sync clears them);
 *   - any other reason (fraud, manual, compliance…) is always honoured.
 * `staleRows` tells the caller the rows disagree with the live balance (rows the
 * balance has lifted, or a floor breach with no global row yet) — resync.
 */
export declare function resolveWalletBlockState(input: {
    balance: number;
    floor: unknown;
    autoUnblockOnZero?: boolean;
    storedBlocks: readonly StoredWalletBlock[];
}): {
    globalBlocked: boolean;
    effectiveBlocks: StoredWalletBlock[];
    staleRows: boolean;
};
export type MinBalanceMode = "off" | "warn" | "enforce";
export declare const MIN_BALANCE_RESTRICTED_SERVICES: readonly ["parcel", "person_ride"];
export type MinBalanceRestrictedService = (typeof MIN_BALANCE_RESTRICTED_SERVICES)[number];
export type RiderMinBalanceStatus = {
    mode: MinBalanceMode;
    threshold: number;
    balance: number;
    shortfall: number;
    belowMinimum: boolean;
    restricted: boolean;
    restrictedServices: MinBalanceRestrictedService[];
    message: string | null;
};
/**
 * The retired positive-minimum rule always reports "off": never restricted, no
 * shortfall, no message. Installed rider apps read `walletMinBalance` and show a
 * "Recharge to ₹200" banner only when belowMinimum/restricted — so they now show
 * nothing, and the wallet floor (globalWalletBlock) is the only balance gate.
 */
export declare function neutralMinBalanceStatus(balance: number): RiderMinBalanceStatus;
//# sourceMappingURL=index.d.ts.map