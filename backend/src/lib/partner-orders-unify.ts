/**
 * Partner pipeline uses orders_core.current_status (PLACED, ACCEPTED, PREPARING, …) as the
 * source of truth when set; orders_core.status is a coarser rider/lifecycle enum (assigned, …).
 * orders_food.order_status is aligned when present but may lag or use different spellings.
 */

export type CoreOrderStatus =
  | "assigned"
  | "accepted"
  | "reached_store"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "cancelled"
  | "failed";

export function mapCoreStatusToPartnerUi(coreStatus: string | null | undefined): string {
  const s = String(coreStatus || "assigned").toLowerCase() as CoreOrderStatus;
  switch (s) {
    case "assigned":
      return "CREATED";
    case "accepted":
      return "ACCEPTED";
    case "reached_store":
      return "READY_FOR_PICKUP";
    case "picked_up":
    case "in_transit":
      return "OUT_FOR_DELIVERY";
    case "delivered":
      return "DELIVERED";
    case "cancelled":
      return "CANCELLED";
    case "failed":
      return "RTO";
    default:
      return "CREATED";
  }
}

export function normFoodStatus(s: string | null | undefined): string {
  const u = String(s || "CREATED").toUpperCase();
  return u === "NEW" ? "CREATED" : u;
}

export function mapStateMachineStatusToPartnerUi(raw: string | null | undefined): string | null {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (!u) return null;

  if (["PLACED", "CREATED", "ORDER_RECEIVED", "ORDER_PLACED", "NEW"].includes(u)) return "CREATED";
  if (u === "ACCEPTED") return "ACCEPTED";
  if (u === "PREPARING") return "PREPARING";
  if (["READY_FOR_PICKUP", "READY", "DISPATCH_READY", "DISPATCHREADY", "DISPATCH_READY_FOR_PICKUP"].includes(u)) {
    return "READY_FOR_PICKUP";
  }
  if (
    [
      "OUT_FOR_DELIVERY",
      "PICKED_UP",
      "IN_TRANSIT",
      "ON_THE_WAY",
      "PICKEDUP",
      "DISPATCHED",
      "DESPATCHED",
    ].includes(u)
  ) {
    return "OUT_FOR_DELIVERY";
  }
  if (u === "DELIVERED") return "DELIVERED";
  if (u === "CANCELLED") return "CANCELLED";
  if (["RTO", "FAILED", "FAILURE"].includes(u)) return "RTO";

  if (
    ["CREATED", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RTO"].includes(
      u
    )
  ) {
    return u;
  }
  return null;
}

const PIPELINE_RANK = [
  "CREATED",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

function pipelineRank(status: string): number {
  const i = PIPELINE_RANK.indexOf(status as (typeof PIPELINE_RANK)[number]);
  return i >= 0 ? i : -1;
}

export function resolvePartnerPipeline(
  foodOrderStatus: string | null | undefined,
  coreStatus: string | null | undefined,
  currentStatus: string | null | undefined
): string {
  const cur = mapStateMachineStatusToPartnerUi(currentStatus);
  const fromFood = mapStateMachineStatusToPartnerUi(foodOrderStatus);
  const fromCore = mapCoreStatusToPartnerUi(coreStatus);

  for (const s of [cur, fromFood, fromCore]) {
    if (s === "CANCELLED" || s === "RTO") return s;
  }
  if (cur === "DELIVERED" || fromFood === "DELIVERED" || fromCore === "DELIVERED") {
    return "DELIVERED";
  }

  let best = fromCore;
  for (const s of [cur, fromFood, fromCore]) {
    if (!s) continue;
    if (pipelineRank(s) > pipelineRank(best)) best = s;
  }
  return best || "CREATED";
}
