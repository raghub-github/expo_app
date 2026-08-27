/**
 * Canonical food-orders dashboard stage + action resolution.
 * Shared by list API enrichment and FoodOrdersClient Action column.
 * Must stay aligned with SQL in food-orders-dashboard-stages.ts.
 */

export type FoodDashboardStage =
  | "PAYMENT DONE"
  | "ACCEPTED"
  | "DESPATCH READY"
  | "DESPATCHED"
  | "BULK"
  | null;

/** Final outcomes — never actionable on the food ops board. */
export const FOOD_ORDER_TERMINAL_STATUSES = [
  "COMPLETED",
  "COMPLETE",
  "DELIVERED",
  "CANCELLED",
  "CANCELED",
  "FAILED",
  "REJECTED",
  "RTO",
  "RTO_COMPLETED",
  "RTO_INITIATED",
  "RTO_IN_TRANSIT",
  "RTO_DELIVERED",
  "RTO_LOST",
] as const;

const TERMINAL_SET = new Set<string>(FOOD_ORDER_TERMINAL_STATUSES);

const DISPATCHED_CUR = new Set([
  "OUT_FOR_DELIVERY",
  "DISPATCHED",
  "DESPATCHED",
  "ON_THE_WAY",
  "IN_TRANSIT",
  "PICKED_UP",
]);

const DISPATCH_READY_CUR = new Set([
  "READY_FOR_PICKUP",
  "READY",
  "DISPATCH_READY",
  "DISPATCHREADY",
  "DISPATCH_READY_FOR_PICKUP",
]);

const RIDER_AT_MERCHANT_CUR = new Set([
  "RIDER_AT_PICKUP",
  "REACHED_STORE",
  "REACHED_MERCHANT",
]);

const ACCEPTED_CUR = new Set(["ACCEPTED", "PREPARING"]);

const PAYMENT_DONE_CUR = new Set([
  "PLACED",
  "CREATED",
  "NEW",
  "ORDER_PLACED",
  "ORDER_RECEIVED",
  "PAYMENT_DONE",
  "PYMT_ASSIGN_RX",
  "BILL_READY",
  "PAYMENT_INITIATED_AT",
  "PAYMENT_INITIATED",
  "ASSIGNED",
]);

const PAYMENT_DONE_CORE = new Set([
  "assigned",
  "created",
  "bill_ready",
  "payment_initiated_at",
  "payment_done",
  "pymt_assign_rx",
]);

const STAGE_ACTION: Record<Exclude<FoodDashboardStage, null>, string> = {
  "PAYMENT DONE": "Verify with MX",
  ACCEPTED: "Check with MX & RX",
  "DESPATCH READY": "Confirm with RX & MX",
  DESPATCHED: "Check with RX & CX",
  BULK: "Check with MX / RX / CX",
};

export function normalizeFoodStatusKey(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function normalizeCoreStatusKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export type FoodOrderStatusInput = {
  status?: string | null;
  currentStatus?: string | null;
  foodOrderStatus?: string | null;
  cancelledAt?: string | Date | null;
  isBulkOrder?: boolean | null;
  riderPickedUpAt?: string | Date | null;
};

export function isFoodOrderTerminalStatus(input: FoodOrderStatusInput): boolean {
  if (input.cancelledAt != null && String(input.cancelledAt).trim() !== "") {
    return true;
  }
  const core = normalizeCoreStatusKey(input.status);
  const cur = normalizeFoodStatusKey(input.currentStatus);
  const food = normalizeFoodStatusKey(input.foodOrderStatus);

  if (
    core === "delivered" ||
    core === "cancelled" ||
    core === "failed" ||
    core === "rejected" ||
    core === "completed" ||
    core === "complete" ||
    core.startsWith("rto_")
  ) {
    return true;
  }

  if (TERMINAL_SET.has(cur) || TERMINAL_SET.has(food)) return true;
  if (cur.startsWith("RTO_") || food.startsWith("RTO_")) return true;
  return false;
}

function isDispatchReadyKey(key: string): boolean {
  if (!key) return false;
  if (RIDER_AT_MERCHANT_CUR.has(key)) return false;
  if (key.includes("DISPATCH") && key.includes("READY")) return true;
  return DISPATCH_READY_CUR.has(key);
}

function hasRiderPickup(input: FoodOrderStatusInput): boolean {
  return input.riderPickedUpAt != null && String(input.riderPickedUpAt).trim() !== "";
}

function isDispatchedStage(input: FoodOrderStatusInput): boolean {
  const core = normalizeCoreStatusKey(input.status);
  const cur = normalizeFoodStatusKey(input.currentStatus);
  const food = normalizeFoodStatusKey(input.foodOrderStatus);
  if (!hasRiderPickup(input)) return false;
  return (
    DISPATCHED_CUR.has(cur) ||
    DISPATCHED_CUR.has(food) ||
    core === "dispatched" ||
    core === "in_transit" ||
    (core === "picked_up" && !isDispatchReadyKey(cur))
  );
}

function isDispatchedWithoutPickup(input: FoodOrderStatusInput): boolean {
  const core = normalizeCoreStatusKey(input.status);
  const cur = normalizeFoodStatusKey(input.currentStatus);
  const food = normalizeFoodStatusKey(input.foodOrderStatus);
  if (hasRiderPickup(input)) return false;
  return (
    DISPATCHED_CUR.has(cur) ||
    DISPATCHED_CUR.has(food) ||
    core === "dispatched" ||
    core === "in_transit" ||
    (core === "picked_up" && !isDispatchReadyKey(cur))
  );
}

function isDispatchReadyStage(input: FoodOrderStatusInput): boolean {
  const core = normalizeCoreStatusKey(input.status);
  const cur = normalizeFoodStatusKey(input.currentStatus);
  const food = normalizeFoodStatusKey(input.foodOrderStatus);
  const riderAtWithoutReady =
    (core === "reached_store" || RIDER_AT_MERCHANT_CUR.has(cur)) &&
    !DISPATCH_READY_CUR.has(food) &&
    !isDispatchedWithoutPickup(input);

  if (riderAtWithoutReady) return false;

  return (
    isDispatchReadyKey(cur) ||
    DISPATCH_READY_CUR.has(food) ||
    core === "dispatch_ready" ||
    (core === "picked_up" && isDispatchReadyKey(cur)) ||
    isDispatchedWithoutPickup(input)
  );
}

function isAcceptedStage(input: FoodOrderStatusInput): boolean {
  const core = normalizeCoreStatusKey(input.status);
  const cur = normalizeFoodStatusKey(input.currentStatus);
  const food = normalizeFoodStatusKey(input.foodOrderStatus);
  return (
    ACCEPTED_CUR.has(cur) ||
    ACCEPTED_CUR.has(food) ||
    core === "accepted" ||
    ((core === "reached_store" || RIDER_AT_MERCHANT_CUR.has(cur)) &&
      !DISPATCH_READY_CUR.has(food))
  );
}

function isPaymentDoneStage(input: FoodOrderStatusInput): boolean {
  const core = normalizeCoreStatusKey(input.status);
  const cur = normalizeFoodStatusKey(input.currentStatus);
  const food = normalizeFoodStatusKey(input.foodOrderStatus);
  return (
    PAYMENT_DONE_CORE.has(core) ||
    PAYMENT_DONE_CUR.has(cur) ||
    food === "CREATED" ||
    food === "PLACED" ||
    food === "NEW" ||
    food === "ORDER_PLACED" ||
    (core === "assigned" && !cur && (!food || food === "CREATED" || food === "PLACED" || food === "NEW"))
  );
}

/** Current mutually exclusive workflow stage for an active (non-terminal) order. */
export function resolveFoodOrderDashboardStage(
  input: FoodOrderStatusInput
): FoodDashboardStage {
  if (isFoodOrderTerminalStatus(input)) return null;
  if (isDispatchedStage(input)) return "DESPATCHED";
  if (isDispatchReadyStage(input)) return "DESPATCH READY";
  if (isAcceptedStage(input)) return "ACCEPTED";
  if (isPaymentDoneStage(input)) return "PAYMENT DONE";
  if (input.isBulkOrder) return "BULK";
  return null;
}

/** Human-readable Action column for terminal food orders (not workflow CTAs). */
export function foodOrderTerminalActionLabel(input: FoodOrderStatusInput): string {
  const core = normalizeCoreStatusKey(input.status);
  const cur = normalizeFoodStatusKey(input.currentStatus);
  const food = normalizeFoodStatusKey(input.foodOrderStatus);
  const keys = [cur, food, core.toUpperCase()].filter(Boolean);

  const has = (...names: string[]) => keys.some((k) => names.includes(k));
  const startsRto = keys.some((k) => k.startsWith("RTO")) || core.startsWith("rto_");

  if (has("CANCELLED", "CANCELED") || core === "cancelled") return "Cancelled";
  if (has("REJECTED") || core === "rejected") return "Rejected";
  if (has("FAILED") || core === "failed") return "Failed";

  if (startsRto) {
    if (has("RTO_DELIVERED", "RTO_COMPLETED") || core === "rto_delivered" || core === "rto_completed") {
      return "RTO - Delivered";
    }
    if (has("RTO_IN_TRANSIT") || core === "rto_in_transit") return "RTO - In Transit";
    if (has("RTO_INITIATED") || core === "rto_initiated") return "RTO - Initiated";
    if (has("RTO_LOST") || core === "rto_lost") return "RTO - Lost";
    if (has("RTO") || core === "rto") return "RTO";
    return "RTO";
  }

  if (has("DELIVERED") || core === "delivered") return "Delivered";
  if (has("COMPLETED", "COMPLETE") || core === "completed" || core === "complete") {
    return "Delivered";
  }

  return "Delivered";
}

/**
 * Action column label for the food orders list.
 * Terminal → Delivered / Cancelled / RTO - Delivered / …; else stage CTA for THIS order.
 */
export function resolveFoodOrderDashboardAction(
  input: FoodOrderStatusInput
): { isTerminal: boolean; isActionable: boolean; action: string | null; stage: FoodDashboardStage } {
  if (isFoodOrderTerminalStatus(input)) {
    return {
      isTerminal: true,
      isActionable: false,
      action: foodOrderTerminalActionLabel(input),
      stage: null,
    };
  }
  const stage = resolveFoodOrderDashboardStage(input);
  if (!stage) {
    return { isTerminal: false, isActionable: false, action: null, stage: null };
  }
  return {
    isTerminal: false,
    isActionable: true,
    action: STAGE_ACTION[stage],
    stage,
  };
}
