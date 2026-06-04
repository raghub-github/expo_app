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
        raw,
    };
}
export function buildIdempotencyKey(prefix, parts) {
    return `${prefix}:${parts.filter((p) => p != null && p !== "").join(":")}`;
}
