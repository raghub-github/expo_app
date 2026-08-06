import { resolvePartnerPipeline, hasRiderMarkedFoodPickup } from "./partner-orders-unify.js";

const CUSTOMER_STATUS_RANK: Record<string, number> = {
  ORDER_PLACED: 0,
  CREATED: 0,
  PLACED: 0,
  ACCEPTED: 1,
  PREPARING: 2,
  RIDER_ASSIGNED: 3,
  READY: 3,
  READY_FOR_PICKUP: 3,
  REACHED_STORE: 4,
  RIDER_AT_PICKUP: 4,
  RIDER_AT_MERCHANT: 4,
  REACHED_MERCHANT: 4,
  OUT_FOR_DELIVERY: 5,
  ON_THE_WAY: 5,
  PICKED_UP: 5,
  IN_TRANSIT: 5,
  PICKED_BY_RIDER: 5,
  DISPATCHED: 5,
  RIDE_IN_PROGRESS: 5,
  REACHED_CUSTOMER: 6,
  RIDER_AT_DROP: 6,
  AT_CUSTOMER: 6,
  DELIVERED: 7,
  CANCELLED: 99,
  FAILED: 99,
  PAYMENT_FAILED: 99,
  RTO: 99,
};

const TERMINAL_STATUSES = new Set(["DELIVERED", "CANCELLED", "FAILED", "PAYMENT_FAILED", "RTO"]);

function customerStatusRank(status: string): number {
  return CUSTOMER_STATUS_RANK[status] ?? -1;
}

function pickHigherCustomerStatus(a: string, b: string): string {
  return customerStatusRank(b) > customerStatusRank(a) ? b : a;
}

function partnerPipelineToCustomer(pipeline: string): string {
  switch (pipeline) {
    case "CREATED":
      return "ORDER_PLACED";
    case "ACCEPTED":
      return "ACCEPTED";
    case "PREPARING":
      return "PREPARING";
    case "READY_FOR_PICKUP":
      return "READY_FOR_PICKUP";
    case "OUT_FOR_DELIVERY":
      return "OUT_FOR_DELIVERY";
    case "DELIVERED":
      return "DELIVERED";
    case "CANCELLED":
      return "CANCELLED";
    case "RTO":
      return "FAILED";
    default:
      return pipeline;
  }
}

function normalizeOmsStatus(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  if (trimmed === "PLACED") return "ORDER_PLACED";
  return trimmed.toUpperCase().replace(/[\s-]+/g, "_");
}

function coreLifecycleToCustomer(coreStatus: string | null | undefined): string | null {
  switch (String(coreStatus ?? "").toLowerCase()) {
    case "reached_store":
      return "REACHED_STORE";
    case "reached_user":
      return "REACHED_CUSTOMER";
    case "picked_up":
    case "in_transit":
      return "OUT_FOR_DELIVERY";
    case "delivered":
      return "DELIVERED";
    case "cancelled":
      return "CANCELLED";
    case "failed":
      return "FAILED";
    default:
      return null;
  }
}

function toAppStatusFromCore(dbStatus: string | null | undefined): string {
  const fromLifecycle = coreLifecycleToCustomer(dbStatus);
  if (fromLifecycle) return fromLifecycle;
  const s = String(dbStatus ?? "assigned").toLowerCase();
  const map: Record<string, string> = {
    assigned: "ORDER_PLACED",
    accepted: "ORDER_PLACED",
    reached_store: "PREPARING",
    reached_user: "RIDER_AT_PICKUP",
    picked_up: "ON_THE_WAY",
    in_transit: "ON_THE_WAY",
    delivered: "DELIVERED",
    cancelled: "CANCELLED",
    failed: "FAILED",
  };
  return map[s] ?? String(dbStatus ?? "ORDER_PLACED").toUpperCase();
}

/** Uppercase OMS / rider statuses for the customer app. */
export function normalizeCustomerOrderStatus(
  currentStatus: string | null | undefined,
  dbStatus: string | null | undefined
): string {
  const cur = String(currentStatus ?? "").trim();
  if (cur === "PLACED") return "ORDER_PLACED";
  if (cur) return cur.toUpperCase().replace(/[\s-]+/g, "_");
  return toAppStatusFromCore(dbStatus).toUpperCase();
}

function isCustomerOnTheWay(status: string): boolean {
  const rank = customerStatusRank(status);
  return rank >= customerStatusRank("OUT_FOR_DELIVERY") && rank < customerStatusRank("DELIVERED");
}

/**
 * Person-ride list/detail status for the customer app.
 * Food pipeline mapping must NOT be used for rides — it can hide active trips
 * (e.g. accepted captain) behind READY_FOR_PICKUP / ORDER_PLACED heuristics.
 */
export function resolvePersonRideCustomerStatus(args: {
  coreStatus: string | null | undefined;
  currentStatus: string | null | undefined;
  riderId: number | null | undefined;
}): string {
  const dbStatus = String(args.coreStatus ?? "assigned").trim().toLowerCase();
  const cur = String(args.currentStatus ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const hasRider = args.riderId != null && Number(args.riderId) > 0;

  if (dbStatus === "cancelled" || cur === "CANCELLED") return "CANCELLED";
  if (dbStatus === "delivered" || cur === "DELIVERED") return "DELIVERED";
  if (dbStatus === "failed" || cur === "FAILED" || cur === "PAYMENT_FAILED") {
    return cur === "PAYMENT_FAILED" ? "PAYMENT_FAILED" : "FAILED";
  }

  if (dbStatus === "picked_up" || dbStatus === "in_transit" || cur === "RIDE_IN_PROGRESS") {
    return "RIDE_IN_PROGRESS";
  }

  if (
    dbStatus === "reached_user" ||
    cur === "RIDER_AT_PICKUP" ||
    cur === "REACHED_USER"
  ) {
    return "RIDER_AT_PICKUP";
  }

  if (
    hasRider ||
    dbStatus === "accepted" ||
    dbStatus === "reached_store" ||
    cur === "RIDER_ASSIGNED" ||
    cur === "ACCEPTED" ||
    cur === "ASSIGNED"
  ) {
    return "RIDER_ASSIGNED";
  }

  if (cur === "SEARCHING_RIDER" || cur === "PLACED" || cur === "ORDER_PLACED" || dbStatus === "assigned") {
    return "SEARCHING_RIDER";
  }

  return cur || "SEARCHING_RIDER";
}

/**
 * Merge orders_food.order_status, orders_core.current_status, and rider lifecycle
 * into a single customer-app status string.
 */
export function resolveCustomerAppOrderStatus(args: {
  currentStatus: string | null | undefined;
  coreStatus: string | null | undefined;
  foodOrderStatus: string | null | undefined;
  riderId: number | null | undefined;
  riderReachedPickupAt?: string | Date | null;
  riderPickedUpAt?: string | Date | null;
  /** When set, use ride-specific mapping (never food pickup caps). */
  orderType?: string | null;
}): string {
  if (String(args.orderType ?? "").trim().toLowerCase() === "person_ride") {
    return resolvePersonRideCustomerStatus({
      coreStatus: args.coreStatus,
      currentStatus: args.currentStatus,
      riderId: args.riderId,
    });
  }
  const riderPickedUpIso =
    args.riderPickedUpAt instanceof Date
      ? args.riderPickedUpAt.toISOString()
      : args.riderPickedUpAt != null
        ? String(args.riderPickedUpAt)
        : null;

  const pipeline = resolvePartnerPipeline(
    args.foodOrderStatus,
    args.coreStatus,
    args.currentStatus,
    riderPickedUpIso
  );

  let status = partnerPipelineToCustomer(pipeline);

  const currentNorm = normalizeOmsStatus(args.currentStatus);
  if (currentNorm) {
    if (TERMINAL_STATUSES.has(currentNorm)) return currentNorm;
    status = pickHigherCustomerStatus(status, currentNorm);
  }

  const fromCoreLifecycle = coreLifecycleToCustomer(args.coreStatus);
  if (fromCoreLifecycle) {
    if (TERMINAL_STATUSES.has(fromCoreLifecycle)) return fromCoreLifecycle;
    status = pickHigherCustomerStatus(status, fromCoreLifecycle);
  }

  const hasRider = args.riderId != null && Number(args.riderId) > 0;
  if (hasRider && !TERMINAL_STATUSES.has(status) && !isCustomerOnTheWay(status)) {
    if (args.riderReachedPickupAt && customerStatusRank(status) < customerStatusRank("REACHED_STORE")) {
      status = pickHigherCustomerStatus(status, "REACHED_STORE");
    } else if (
      customerStatusRank(status) <= customerStatusRank("ACCEPTED") &&
      pipeline !== "PREPARING" &&
      pipeline !== "READY_FOR_PICKUP"
    ) {
      status = pickHigherCustomerStatus(status, "RIDER_ASSIGNED");
    } else if (pipeline === "PREPARING") {
      status = pickHigherCustomerStatus(status, "PREPARING");
    } else if (pipeline === "READY_FOR_PICKUP") {
      status = pickHigherCustomerStatus(status, "READY_FOR_PICKUP");
    }
  }

  /**
   * Cap premature merchant/core "out for delivery" until the rider marks pickup —
   * EXCEPT when an agent already forced Dispatched (`orders_core.status = in_transit`
   * / current_status Dispatched). That is the admin override when the rider app
   * cannot mark reach/pickup.
   */
  const coreLower = String(args.coreStatus ?? "").trim().toLowerCase();
  const agentForcedDispatch =
    coreLower === "in_transit" ||
    coreLower === "picked_up" ||
    currentNorm === "DISPATCHED" ||
    currentNorm === "DESPATCHED" ||
    currentNorm === "IN_TRANSIT";

  if (!hasRiderMarkedFoodPickup(riderPickedUpIso) && isCustomerOnTheWay(status)) {
    if (agentForcedDispatch) {
      status = pickHigherCustomerStatus(status, "OUT_FOR_DELIVERY");
    } else if (args.riderReachedPickupAt) {
      status = "REACHED_STORE";
    } else if (pipeline === "PREPARING") {
      status = "PREPARING";
    } else {
      status = "READY_FOR_PICKUP";
    }
  }

  return status;
}
