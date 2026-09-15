/**
 * Batch dispatch — operational-state model (PURE). Maps a real order status to the operational
 * state the batching engine reasons about, and answers the single most important batching question
 * (§37–39): may a rider carrying THIS order be offered ANOTHER order right now?
 *
 * Rule: additional orders may be offered while every existing order is still PRE-PICKUP
 * (assigned / accepted / reached_store = arrived at pickup). Once ANY order is PICKED_UP / IN_TRANSIT
 * / arrived at drop (reached_user), the rider is actively carrying/delivering — no new batch offer
 * until that order completes. Terminal states (delivered/cancelled/failed) don't count as active.
 */

export type OrderStatus =
  | "assigned"
  | "accepted"
  | "reached_store"
  | "reached_user"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "cancelled"
  | "failed"
  | (string & {});

export type BatchOperationalState =
  | "PRE_PICKUP" // assigned/accepted/en-route-to-pickup/arrived-at-pickup → additional orders allowed
  | "CARRYING" // picked_up/in_transit/arrived-at-drop → delivering; no new batch offer
  | "TERMINAL"; // delivered/cancelled/failed → not an active order

const PRE_PICKUP = new Set(["assigned", "accepted", "reached_store"]);
const CARRYING = new Set(["picked_up", "in_transit", "reached_user"]);
const TERMINAL = new Set(["delivered", "cancelled", "failed"]);

export function operationalState(status: OrderStatus): BatchOperationalState {
  const s = String(status ?? "").trim().toLowerCase();
  if (TERMINAL.has(s)) return "TERMINAL";
  if (CARRYING.has(s)) return "CARRYING";
  if (PRE_PICKUP.has(s)) return "PRE_PICKUP";
  // Unknown status → treat conservatively as CARRYING (never risk a batch on an ambiguous state).
  return "CARRYING";
}

/** An order counts toward active batch capacity unless it is terminal. */
export function isActiveOrder(status: OrderStatus): boolean {
  return operationalState(status) !== "TERMINAL";
}

/**
 * Given the statuses of a rider's current active orders, can the rider receive an ADDITIONAL
 * batchable order? True only when every active order is still pre-pickup (none being carried).
 * An empty list (idle rider) returns true — the caller decides first-order vs additional.
 */
export function riderStatePermitsBatching(activeOrderStatuses: OrderStatus[]): boolean {
  for (const st of activeOrderStatuses) {
    const state = operationalState(st);
    if (state === "TERMINAL") continue;
    if (state !== "PRE_PICKUP") return false; // something is being carried/delivered
  }
  return true;
}
