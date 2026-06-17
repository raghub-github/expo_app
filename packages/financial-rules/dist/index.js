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
