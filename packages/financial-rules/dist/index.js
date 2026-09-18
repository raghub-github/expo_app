export function mapActorToTriggeredBy(actorType) {
    const a = String(actorType ?? "").toLowerCase();
    if (a === "customer")
        return "CUSTOMER";
    if (a === "store" || a === "merchant")
        return "MERCHANT";
    if (a === "rider")
        return "RIDER";
    if (a === "admin" || a === "dashboard")
        return "ADMIN";
    if (a === "platform")
        return "PLATFORM";
    return "SYSTEM";
}
export function resolvePaymentCancellationMilestone(input) {
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
    if (prev === "CREATED" ||
        prev === "NEW" ||
        prev === "PLACED" ||
        prev === "ORDER_PLACED" ||
        prev === "ORDER_RECEIVED") {
        return { orderMilestone: "ORDER_CREATED", cancelledBy };
    }
    return { orderMilestone: "PRE_PICKUP_CANCELLED", cancelledBy };
}
export function scenarioForOrderStatus(status) {
    const s = String(status).toUpperCase();
    if (s === "RTO")
        return "RTO";
    if (s === "CANCELLED")
        return "CANCELLATION";
    return "CANCELLATION";
}
export function refundFieldsFromEngineResult(result) {
    if (!result?.ok) {
        return { refundStatus: "no_refund", refundAmount: null };
    }
    const amounts = result.amounts;
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
export function resolvePostCancelAutoRefundPolicy(input) {
    const role = String(input.actorRole ?? "").trim().toLowerCase();
    const grossRaw = Number(input.orderGross);
    const gross = Number.isFinite(grossRaw) && grossRaw > 0.005
        ? Math.round(grossRaw * 100) / 100
        : null;
    const engineStatus = String(input.engineRefund.refundStatus ?? "")
        .trim()
        .toLowerCase();
    const engineAmtRaw = Number(input.engineRefund.refundAmount);
    const engineAmt = Number.isFinite(engineAmtRaw) && engineAmtRaw > 0.005
        ? Math.round(engineAmtRaw * 100) / 100
        : null;
    if (role === "customer" || role === "cx") {
        return {
            shouldAutoExecute: false,
            executeAmount: null,
            refundStatus: engineStatus || "no_refund",
            refundAmountForLedger: engineAmt,
            skipReason: "customer_actor",
        };
    }
    if (engineStatus === "pending_approval") {
        return {
            shouldAutoExecute: false,
            executeAmount: null,
            refundStatus: "pending_approval",
            refundAmountForLedger: engineAmt,
            skipReason: "pending_approval",
        };
    }
    // Matched admin/financial rule with a concrete refund amount — honor it.
    if (engineAmt != null) {
        return {
            shouldAutoExecute: true,
            executeAmount: engineAmt,
            refundStatus: engineStatus === "no_refund" ? "pending" : engineStatus || "pending",
            refundAmountForLedger: engineAmt,
        };
    }
    const forceSilentRefund = input.forceCustomerRefundWhenEngineSilent === true ||
        role === "store" ||
        role === "merchant" ||
        role === "system" ||
        role === "rider";
    if (forceSilentRefund) {
        return {
            shouldAutoExecute: true,
            executeAmount: null,
            refundStatus: "pending",
            refundAmountForLedger: gross,
        };
    }
    return {
        shouldAutoExecute: false,
        executeAmount: null,
        refundStatus: engineStatus || "no_refund",
        refundAmountForLedger: null,
        skipReason: "admin_no_refund",
    };
}
export function parseEngineResult(raw) {
    if (!raw)
        return { applied: false, error: "empty_result" };
    const amountsRaw = raw.amounts;
    return {
        applied: Boolean(raw.ok),
        ok: Boolean(raw.ok),
        duplicate: Boolean(raw.duplicate),
        engine: raw.engine,
        executionStatus: (raw.execution_status ?? raw.executionStatus),
        ruleId: raw.rule_id != null ? Number(raw.rule_id) : null,
        ruleCode: raw.rule_code,
        executionLogId: raw.execution_log_id != null ? Number(raw.execution_log_id) : undefined,
        reconciliation: raw.reconciliation,
        amounts: amountsRaw,
        raw,
    };
}
export function formatEnginePreviewStatus(status) {
    if (!status)
        return "Unknown";
    const labels = {
        APPROVAL_REQUIRED: "Approval required",
        SIMULATED: "Simulated preview",
        COMPLETED: "Will apply on submit",
        NO_RULE: "No matching rule",
        FAILED: "Failed",
        UNAVAILABLE: "Unavailable",
    };
    return labels[status] ?? status.replace(/_/g, " ");
}
export function formatEnginePreviewError(error) {
    if (!error)
        return "";
    const labels = {
        no_rule_engine: "Financial rule engine is not configured in this environment.",
        no_matching_rule: "No active financial rule matches this order scenario, stage, and cancellation reason.",
        empty_result: "Rule engine returned an empty result.",
        payment_engine_not_migrated: "Legacy payment engine is not available.",
        invalid_order_gross: "Invalid order amount for rule calculation.",
    };
    return labels[error] ?? error.replace(/_/g, " ");
}
/** Normalize gm_execute_rule / simulate output for dashboard preview UI. */
export function normalizeEnginePreviewDisplay(result, extras) {
    const raw = (result.raw ?? {});
    const ok = Boolean(raw.ok ?? result.ok ?? result.applied);
    const ruleCode = (typeof raw.rule_code === "string" ? raw.rule_code : null) ?? result.ruleCode ?? null;
    let executionStatus = (typeof raw.execution_status === "string" ? raw.execution_status : null) ??
        result.executionStatus ??
        null;
    if (!executionStatus) {
        if (raw.approval_required === true)
            executionStatus = "APPROVAL_REQUIRED";
        else if (raw.simulated === true && ok)
            executionStatus = "SIMULATED";
        else if (ok)
            executionStatus = "COMPLETED";
        else if (result.error || raw.reason)
            executionStatus = ruleCode ? "FAILED" : "NO_RULE";
    }
    const amounts = raw.amounts && typeof raw.amounts === "object"
        ? raw.amounts
        : result.amounts
            ? result.amounts
            : null;
    const error = result.error ??
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
export function buildIdempotencyKey(prefix, parts) {
    return `${prefix}:${parts.filter((p) => p != null && p !== "").join(":")}`;
}
function toInt(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0)
        return 0;
    return Math.trunc(v);
}
/** Display-only rate; the block decision never uses this rounded/float value. */
export function cancellationRatePct(accepted, riderFault) {
    const a = toInt(accepted);
    const f = toInt(riderFault);
    if (a <= 0)
        return 0;
    return (f / a) * 100;
}
/** The slab whose [minAccepted, maxAccepted] contains `accepted` (max null = ∞). */
export function selectCancellationSlab(slabs, accepted) {
    const a = toInt(accepted);
    if (a <= 0)
        return null;
    for (const s of slabs) {
        const min = toInt(s.minAccepted);
        const max = s.maxAccepted == null ? Infinity : toInt(s.maxAccepted);
        if (a >= min && a <= max)
            return s;
    }
    return null;
}
/**
 * Authoritative evaluation. Integer/rational comparison only:
 *   rate >= threshold  <=>  riderFault/accepted >= thresholdPct/100
 *                      <=>  riderFault * 10000 >= round(thresholdPct*100) * accepted
 * so 60.00% is exactly 60%, and 7/11 is compared as a true ratio (never 63.64%).
 */
export function evaluateCancellationSlabPolicy(input) {
    const accepted = toInt(input.accepted);
    const riderFault = Math.min(toInt(input.riderFault), accepted);
    const ratePct = cancellationRatePct(accepted, riderFault);
    const base = { accepted, riderFault, ratePct };
    if (!input.enabled) {
        return { ...base, currentSlab: null, thresholdPct: null, blockingEnabled: false, shouldBlock: false, reason: "policy_disabled" };
    }
    if (accepted <= 0) {
        return { ...base, currentSlab: null, thresholdPct: null, blockingEnabled: false, shouldBlock: false, reason: "no_accepted_orders" };
    }
    const slab = selectCancellationSlab(input.slabs, accepted);
    if (!slab) {
        return { ...base, currentSlab: null, thresholdPct: null, blockingEnabled: false, shouldBlock: false, reason: "no_matching_slab" };
    }
    if (!slab.blockingEnabled) {
        return { ...base, currentSlab: slab, thresholdPct: slab.thresholdPct, blockingEnabled: false, shouldBlock: false, reason: "grace_slab" };
    }
    if (riderFault <= 0) {
        return { ...base, currentSlab: slab, thresholdPct: slab.thresholdPct, blockingEnabled: true, shouldBlock: false, reason: "no_rider_fault" };
    }
    const thresholdBps = Math.round(Number(slab.thresholdPct) * 100); // 0..10000
    const shouldBlock = riderFault * 10000 >= thresholdBps * accepted;
    return {
        ...base,
        currentSlab: slab,
        thresholdPct: slab.thresholdPct,
        blockingEnabled: true,
        shouldBlock,
        reason: shouldBlock ? "threshold_reached" : "below_threshold",
    };
}
/**
 * Validate an admin-edited slab set for one service. Returns human-readable
 * errors ([] = valid). Enforces: >=1 slab; positive contiguous ranges starting
 * at 1 with no gaps/overlaps; only the last slab may be open-ended; thresholds
 * within 0..100; unique ascending slab numbers.
 */
export function validateCancellationSlabs(slabs) {
    const errors = [];
    if (!Array.isArray(slabs) || slabs.length === 0) {
        return ["At least one slab is required."];
    }
    const sorted = [...slabs].sort((a, b) => a.minAccepted - b.minAccepted);
    const numbers = new Set();
    for (const s of sorted) {
        if (numbers.has(s.slabNumber))
            errors.push(`Duplicate slab number ${s.slabNumber}.`);
        numbers.add(s.slabNumber);
        if (!Number.isInteger(s.minAccepted) || s.minAccepted < 1) {
            errors.push(`Slab ${s.slabNumber}: minimum accepted orders must be a whole number ≥ 1.`);
        }
        if (s.maxAccepted != null) {
            if (!Number.isInteger(s.maxAccepted) || s.maxAccepted < s.minAccepted) {
                errors.push(`Slab ${s.slabNumber}: maximum must be a whole number ≥ minimum (or blank for open-ended).`);
            }
        }
        if (!(s.thresholdPct >= 0 && s.thresholdPct <= 100)) {
            errors.push(`Slab ${s.slabNumber}: threshold must be between 0 and 100%.`);
        }
    }
    if (sorted[0] && sorted[0].minAccepted !== 1) {
        errors.push("The first slab must start at 1 accepted order.");
    }
    for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i];
        const next = sorted[i + 1];
        if (next) {
            if (cur.maxAccepted == null) {
                errors.push(`Slab ${cur.slabNumber}: only the last slab may be open-ended.`);
            }
            else if (next.minAccepted !== cur.maxAccepted + 1) {
                errors.push(`Slabs must be contiguous with no gaps or overlaps: slab ${next.slabNumber} should start at ${cur.maxAccepted + 1}.`);
            }
        }
    }
    return errors;
}
/** Reference defaults (seeded by migration): grace 1–5, then 60% / 35% / 20% (top open-ended). */
export const DEFAULT_CANCELLATION_SLABS = [
    { slabNumber: 1, minAccepted: 1, maxAccepted: 5, blockingEnabled: false, thresholdPct: 0 },
    { slabNumber: 2, minAccepted: 6, maxAccepted: 15, blockingEnabled: true, thresholdPct: 60 },
    { slabNumber: 3, minAccepted: 16, maxAccepted: 25, blockingEnabled: true, thresholdPct: 35 },
    { slabNumber: 4, minAccepted: 26, maxAccepted: null, blockingEnabled: true, thresholdPct: 20 },
];
