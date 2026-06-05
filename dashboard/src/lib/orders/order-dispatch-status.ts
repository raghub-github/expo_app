/**
 * Manual dispatch status updates (Dispatch Ready → Dispatched → Delivered).
 * Aligns orders_core.status, current_status, and orders_food.order_status.
 */

export type ManualStatusValue = "picked_up" | "in_transit" | "delivered";

export type DispatchManualStage =
  | "open"
  | "ready"
  | "dispatched"
  | "delivered"
  | "cancelled";

/** Kitchen / merchant marked ready — not rider GPS at store. */
const DISPATCH_READY_CUR = new Set([
  "READY_FOR_PICKUP",
  "READY",
  "DISPATCH_READY",
  "DISPATCHREADY",
  "DISPATCH_READY_FOR_PICKUP",
]);

/** Rider reached merchant; food may still be ACCEPTED / PREPARING. */
const RIDER_AT_MERCHANT_CUR = new Set(["RIDER_AT_PICKUP", "REACHED_STORE"]);

const DISPATCHED_CUR = new Set([
  "OUT_FOR_DELIVERY",
  "DISPATCHED",
  "DESPATCHED",
  "ON_THE_WAY",
  "IN_TRANSIT",
  "PICKED_UP",
]);

function normalizeKey(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function isDispatchReadyCurrent(cur: string): boolean {
  if (!cur) return false;
  if (RIDER_AT_MERCHANT_CUR.has(cur)) return false;
  if (cur.includes("DISPATCH") && cur.includes("READY")) return true;
  return DISPATCH_READY_CUR.has(cur);
}

function isMerchantOrAgentDispatchReady(params: {
  core: string;
  cur: string;
  food: string;
}): boolean {
  if (isDispatchReadyFood(params.food)) return true;
  if (params.core === "picked_up" || params.core === "dispatch_ready") return true;
  if (isDispatchReadyCurrent(params.cur)) return true;
  return false;
}

/** Rider at store but merchant has not marked order ready (common when Mx app missing). */
function isRiderAtMerchantWithoutFoodReady(params: {
  core: string;
  cur: string;
  food: string;
}): boolean {
  const riderAtStore =
    params.core === "reached_store" || RIDER_AT_MERCHANT_CUR.has(params.cur);
  if (!riderAtStore) return false;
  return !isMerchantOrAgentDispatchReady(params);
}

function isDispatchedCurrent(cur: string): boolean {
  return DISPATCHED_CUR.has(cur);
}

function isDispatchReadyFood(food: string): boolean {
  return DISPATCH_READY_CUR.has(food);
}

function isDispatchedFood(food: string): boolean {
  return DISPATCHED_CUR.has(food);
}

/** Resolve how far the order has progressed for manual status UI + API guards. */
export function resolveDispatchManualStage(params: {
  status?: string | null;
  currentStatus?: string | null;
  foodOrderStatus?: string | null;
}): DispatchManualStage {
  const core = (params.status ?? "").toLowerCase().trim();
  const cur = normalizeKey(params.currentStatus);
  const food = normalizeKey(params.foodOrderStatus);

  if (
    core === "cancelled" ||
    core === "rejected" ||
    core === "failed" ||
    cur === "CANCELLED" ||
    cur === "CANCELED" ||
    cur === "REJECTED" ||
    food === "CANCELLED" ||
    food === "CANCELED"
  ) {
    return "cancelled";
  }

  if (core === "delivered" || cur === "DELIVERED" || food === "DELIVERED") {
    return "delivered";
  }

  if (
    core === "in_transit" ||
    isDispatchedCurrent(cur) ||
    isDispatchedFood(food) ||
    (core === "picked_up" && !isDispatchReadyCurrent(cur) && cur !== "" && !isDispatchReadyFood(food))
  ) {
    return "dispatched";
  }

  if (isRiderAtMerchantWithoutFoodReady({ core, cur, food })) {
    return "open";
  }

  if (isMerchantOrAgentDispatchReady({ core, cur, food })) {
    return "ready";
  }

  return "open";
}

/** Whether a manual status option should be disabled in the order-page picker. */
export function isManualStatusOptionDisabled(
  stage: DispatchManualStage,
  value: ManualStatusValue
): boolean {
  if (stage === "cancelled" || stage === "delivered") return true;
  if (stage === "dispatched") return value === "picked_up" || value === "in_transit";
  if (stage === "ready") return value === "picked_up";
  return false;
}

export function canApplyManualStatusUpdate(
  stage: DispatchManualStage,
  value: ManualStatusValue
): boolean {
  return !isManualStatusOptionDisabled(stage, value);
}

export const MANUAL_STATUS_LABELS: Record<ManualStatusValue, string> = {
  picked_up: "Dispatch Ready",
  in_transit: "Dispatched",
  delivered: "Delivered",
};
