/**
 * Customer-app order status machine.
 *
 * Backend is the only authority. This module:
 *  - aliases COMPLETED → DELIVERED
 *  - ranks lifecycle statuses so stale HTTP cannot regress a newer state
 *  - treats terminal statuses as sticky
 */

import {
  isTerminalOrderStatus,
  normalizeCustomerOrderStatus,
} from "@/lib/customer-order-status-display";

const CUSTOMER_STATUS_RANK: Record<string, number> = {
  ORDER_PLACED: 0,
  CREATED: 0,
  PLACED: 0,
  NEW: 0,
  ACCEPTED: 1,
  PREPARING: 2,
  RIDER_ASSIGNED: 3,
  ASSIGNED: 3,
  READY: 3,
  READY_FOR_PICKUP: 3,
  SEARCHING_RIDER: 3,
  REACHED_STORE: 4,
  RIDER_AT_PICKUP: 4,
  RIDER_AT_MERCHANT: 4,
  REACHED_MERCHANT: 4,
  REACHED_PICKUP: 4,
  AT_PICKUP: 4,
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

export function customerOrderStatusRank(status: string | null | undefined): number {
  const s = normalizeCustomerOrderStatus(status);
  if (!s) return -1;
  return CUSTOMER_STATUS_RANK[s] ?? -1;
}

export function isCustomerOrderTerminalStatus(status: string | null | undefined): boolean {
  return isTerminalOrderStatus(status);
}

/**
 * Merge a server-incoming status onto cached client status.
 * Terminal states never regress to in-progress. Rank never goes backwards.
 */
export function selectAuthoritativeCustomerStatus(
  current: string | null | undefined,
  incoming: string | null | undefined
): string {
  const next = normalizeCustomerOrderStatus(incoming);
  const cur = normalizeCustomerOrderStatus(current);
  if (!next) return cur;
  if (!cur) return next;
  if (cur === next) return cur;

  if (isTerminalOrderStatus(cur) && !isTerminalOrderStatus(next)) {
    return cur;
  }
  if (isTerminalOrderStatus(next)) {
    return next;
  }

  const curRank = customerOrderStatusRank(cur);
  const nextRank = customerOrderStatusRank(next);
  if (curRank >= 0 && nextRank < 0) {
    return cur;
  }
  if (curRank >= 0 && nextRank >= 0 && nextRank < curRank) {
    return cur;
  }
  return next;
}

export function collectOrderAliases(
  ...ids: Array<string | null | undefined>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id) continue;
    const key = id.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

export function orderRefsMatch(
  left: { orderId?: string | null; formattedOrderId?: string | null } | string | null | undefined,
  right: { orderId?: string | null; formattedOrderId?: string | null } | string | null | undefined
): boolean {
  const keysFor = (
    value: { orderId?: string | null; formattedOrderId?: string | null } | string | null | undefined
  ): Set<string> => {
    const set = new Set<string>();
    if (value == null) return set;
    if (typeof value === "string") {
      const id = value.trim().toUpperCase();
      if (id) set.add(id);
      return set;
    }
    for (const raw of [value.orderId, value.formattedOrderId]) {
      const id = String(raw ?? "").trim().toUpperCase();
      if (id) set.add(id);
    }
    return set;
  };
  const a = keysFor(left);
  const b = keysFor(right);
  if (a.size === 0 || b.size === 0) return false;
  for (const key of a) {
    if (b.has(key)) return true;
  }
  return false;
}

/** Push / WS template codes that mean the order reached a terminal state. */
export function isCustomerOrderCompletionPush(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  const code = String(
    data.gmType ?? data.template_code ?? data.templateCode ?? data.type ?? ""
  )
    .trim()
    .toUpperCase();
  if (!code) return false;
  return (
    code === "ORDER_DELIVERED" ||
    code === "RIDE_COMPLETED" ||
    code === "PARCEL_DELIVERED" ||
    code.includes("ORDER_DELIVERED") ||
    code.includes("RIDE_COMPLETED") ||
    code.includes("PARCEL_DELIVERED")
  );
}

export function statusFromCustomerLifecyclePush(
  data: Record<string, unknown> | null | undefined
): string | null {
  if (!data) return null;
  const rawStatus = String(data.status ?? data.orderStatus ?? "").trim();
  if (rawStatus) return normalizeCustomerOrderStatus(rawStatus) || null;
  if (isCustomerOrderCompletionPush(data)) return "DELIVERED";
  const code = String(
    data.gmType ?? data.template_code ?? data.templateCode ?? data.type ?? ""
  )
    .trim()
    .toUpperCase();
  if (code.includes("CANCELLED") || code.includes("CANCELED")) return "CANCELLED";
  return null;
}

export function isCustomerOrderStatusEventType(type: string | null | undefined): boolean {
  const t = String(type ?? "").trim().toLowerCase();
  return (
    t === "status_changed" ||
    t === "order.status_changed" ||
    t === "order_status_changed" ||
    t === "order.status.changed" ||
    t === "order.completed" ||
    t === "order_completed"
  );
}
