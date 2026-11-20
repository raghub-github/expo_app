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
// ─────────────────────────────────────────────────────────────────────────────
// Wallet floor — THE balance rule for riders. ONE evaluator for the backend
// (dispatch / duty / withdrawals / app banners) and the dashboard (rider card,
// wallet routes), so "is this rider blocked by their wallet" can never disagree.
// ─────────────────────────────────────────────────────────────────────────────
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
export const DEFAULT_WALLET_ACTIVE_FLOOR = -200;
function walletRound2(n) {
    return Math.round(n * 100) / 100;
}
/** Signed rupees: "₹250", "-₹250", "₹199.50". */
export function formatSignedRupees(n) {
    const v = walletRound2(Number.isFinite(n) ? n : 0);
    const abs = Math.abs(v);
    const body = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
    return v < 0 ? `-₹${body}` : `₹${body}`;
}
/** The configured floor, or −₹200 when the value is missing / invalid / positive. */
export function normalizeWalletActiveFloor(value) {
    if (value == null || value === "")
        return DEFAULT_WALLET_ACTIVE_FLOOR;
    const n = Number(value);
    if (!Number.isFinite(n) || n > 0)
        return DEFAULT_WALLET_ACTIVE_FLOOR;
    return walletRound2(n);
}
/** True when the wallet is at or below the floor (all services paused). */
export function isWalletAtOrBelowFloor(balance, floor) {
    return walletRound2(Number.isFinite(balance) ? balance : 0) <= normalizeWalletActiveFloor(floor);
}
/**
 * Smallest whole-rupee recharge that lifts the balance strictly above the floor
 * (0 when already above). x = ⌊floor − balance⌋ + 1 is the least integer with
 * balance + x > floor: −₹250 → ₹51 (−₹199), −₹200 → ₹1, −₹200.50 → ₹1.
 */
export function walletUnlockAmount(balance, floor) {
    const b = walletRound2(Number.isFinite(balance) ? balance : 0);
    const f = normalizeWalletActiveFloor(floor);
    if (b > f)
        return 0;
    return Math.floor(walletRound2(f - b)) + 1;
}
export function evaluateWalletFloor(input) {
    const floor = normalizeWalletActiveFloor(input.floor);
    const balance = walletRound2(Number.isFinite(input.balance) ? input.balance : 0);
    const blocked = balance <= floor;
    const unlockAmount = blocked ? walletUnlockAmount(balance, floor) : 0;
    const clearDuesAmount = balance < 0 ? walletRound2(-balance) : 0;
    const message = blocked
        ? `Your wallet balance ${formatSignedRupees(balance)} is at or below the ${formatSignedRupees(floor)} limit, so all services are paused. Recharge at least ${formatSignedRupees(unlockAmount)} to unlock` +
            (clearDuesAmount > unlockAmount ? ` (${formatSignedRupees(clearDuesAmount)} clears all dues).` : ".")
        : null;
    return { floor, balance, blocked, unlockAmount, clearDuesAmount, message };
}
/** Block reasons owned by the wallet engine (recomputed by syncNegativeWalletBlocks). */
export const WALLET_ENGINE_BLOCK_REASONS = ["negative_wallet", "global_emergency"];
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
export function resolveWalletBlockState(input) {
    const balance = walletRound2(Number.isFinite(input.balance) ? input.balance : 0);
    const globalBlocked = isWalletAtOrBelowFloor(balance, input.floor);
    const autoUnblock = input.autoUnblockOnZero !== false;
    const effectiveBlocks = [];
    let staleRows = false;
    let sawGlobalRow = false;
    for (const row of input.storedBlocks) {
        if (row.reason === "global_emergency") {
            sawGlobalRow = true;
            if (globalBlocked)
                effectiveBlocks.push(row);
            else
                staleRows = true;
            continue;
        }
        if (row.reason === "negative_wallet") {
            if (autoUnblock && balance > 0)
                staleRows = true;
            else
                effectiveBlocks.push(row);
            continue;
        }
        effectiveBlocks.push(row);
    }
    if (globalBlocked && !sawGlobalRow)
        staleRows = true;
    return { globalBlocked, effectiveBlocks, staleRows };
}
export const MIN_BALANCE_RESTRICTED_SERVICES = ["parcel", "person_ride"];
/**
 * The retired positive-minimum rule always reports "off": never restricted, no
 * shortfall, no message. Installed rider apps read `walletMinBalance` and show a
 * "Recharge to ₹200" banner only when belowMinimum/restricted — so they now show
 * nothing, and the wallet floor (globalWalletBlock) is the only balance gate.
 */
export function neutralMinBalanceStatus(balance) {
    return {
        mode: "off",
        threshold: 0,
        balance: walletRound2(Number.isFinite(balance) ? balance : 0),
        shortfall: 0,
        belowMinimum: false,
        restricted: false,
        restrictedServices: [],
        message: null,
    };
}
