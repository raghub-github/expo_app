import type { OrderRecord } from "@/hooks/useOrders";
import type { ApiFoodOrder, FoodOrderRiderLogEntry } from "@/services/ordersApi";

export function orderHasAssignedRider(order: OrderRecord): boolean {
  const id = order.riderId;
  if (id != null && Number(id) > 0) return true;
  return !!(order.riderName?.trim());
}

function riderLogEntryIsMeaningful(r: FoodOrderRiderLogEntry): boolean {
  const id = Number(r.rider_id);
  if (Number.isFinite(id) && id > 0) return true;
  if ((r.rider_name ?? "").trim()) return true;
  if ((r.assigned_at ?? "").trim()) return true;
  return false;
}

/** True when the order has a real rider identity (current or in riders-log). */
export function hasMeaningfulRiderRecord(
  order: ApiFoodOrder | null | undefined,
  ridersLog: FoodOrderRiderLogEntry[] = []
): boolean {
  if (ridersLog.some(riderLogEntryIsMeaningful)) return true;
  if (!order) return false;

  const orderRiderId = order.rider_id != null ? Number(order.rider_id) : null;
  if (orderRiderId != null && Number.isFinite(orderRiderId) && orderRiderId > 0) return true;
  if ((order.rider_name ?? "").trim()) return true;

  return false;
}

/** True when any rider was ever linked to this order (active, cancelled, or delivered). */
export function orderEverHadRiderAssignment(
  order: ApiFoodOrder | null | undefined,
  ridersLog: FoodOrderRiderLogEntry[] = []
): boolean {
  if (!order) return false;

  for (const r of ridersLog) {
    const id = Number(r.rider_id);
    if (Number.isFinite(id) && id > 0) return true;
    if ((r.rider_name ?? "").trim()) return true;
    if ((r.assigned_at ?? "").trim()) return true;
  }

  const orderRiderId = order.rider_id != null ? Number(order.rider_id) : null;
  if (orderRiderId != null && Number.isFinite(orderRiderId) && orderRiderId > 0) return true;
  if ((order.rider_name ?? "").trim()) return true;
  if ((order.rider_reached_at ?? "").trim()) return true;
  if ((order.rider_picked_up_at ?? "").trim()) return true;
  if ((order.handed_over_to_rider_at ?? "").trim()) return true;

  return false;
}

export function isOrderPastRiderAssignment(stage: OrderRecord["status"]): boolean {
  return stage === "rejected" || stage === "rto";
}

export function pendingRiderStatusLabel(stage: OrderRecord["status"]): string {
  if (isOrderPastRiderAssignment(stage)) {
    return "No delivery partner assigned";
  }
  return "Assigning delivery partner…";
}

export function riderFirstName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "Delivery partner";
  return n.split(/\s+/)[0] ?? n;
}

export function isInactiveRiderAssignment(
  status: string | null | undefined,
  cancelledAt?: string | null,
  rejectedAt?: string | null
): boolean {
  if ((cancelledAt ?? "").trim() || (rejectedAt ?? "").trim()) return true;
  const st = (status ?? "").toUpperCase();
  return st === "CANCELLED" || st === "REJECTED" || st === "UNASSIGNED";
}

/** First non-cancelled assignment from riders-log (API returns newest first). */
export function resolveActiveRiderFromLog(
  riders: FoodOrderRiderLogEntry[]
): FoodOrderRiderLogEntry | null {
  for (const r of riders) {
    if (!isInactiveRiderAssignment(r.assignment_status, r.cancelled_at, r.rejected_at)) {
      return r;
    }
  }
  return null;
}

/** Prior cancelled / rejected assignments. */
export function resolveCancelledRidersFromLog(
  riders: FoodOrderRiderLogEntry[]
): FoodOrderRiderLogEntry[] {
  return riders.filter((r) =>
    isInactiveRiderAssignment(r.assignment_status, r.cancelled_at, r.rejected_at)
  );
}

/** Prior assignments for the rider log sheet — keeps cancelled rows even if same rider is active again. */
export function resolveRiderHistoryExcludingCurrent(
  riders: FoodOrderRiderLogEntry[],
  current: FoodOrderRiderLogEntry | null
): FoodOrderRiderLogEntry[] {
  const currentActive =
    current != null &&
    !isInactiveRiderAssignment(
      current.assignment_status,
      current.cancelled_at,
      current.rejected_at
    )
      ? current
      : null;

  return riders.filter((r) => {
    if (!currentActive) return true;
    const sameRider = Number(r.rider_id) === Number(currentActive.rider_id);
    const rActive = !isInactiveRiderAssignment(
      r.assignment_status,
      r.cancelled_at,
      r.rejected_at
    );
    // Drop only the live current assignment row; keep earlier cancelled spells of the same rider.
    if (sameRider && rActive) return false;
    return true;
  });
}

export function riderStatusLabelFromOrder(order: OrderRecord): string {
  if (order.riderPickedUpAt) return "Out for delivery";
  if (order.riderReachedAt) return "Rider at store";
  const status = (order.riderAssignmentStatus ?? "").toUpperCase();
  if (status === "ACCEPTED" || status === "ACTIVE" || status === "PICKED_UP") {
    return order.riderReachedAt ? "Rider at store" : "Rider on the way";
  }
  if (orderHasAssignedRider(order)) return "Rider assigned";
  return pendingRiderStatusLabel(order.status);
}

/** Card headline — "{Name} is on the way" / "arriving in N mins" (partnersite-style). */
export function riderCardHeadline(order: OrderRecord, etaMinutes?: number | null): string {
  const name = (order.riderName ?? "").trim() || "Delivery partner";
  if (order.riderPickedUpAt) return `${name} is out for delivery`;
  if (order.riderReachedAt) return `${name} has arrived`;
  if (etaMinutes != null && etaMinutes > 0) {
    return `${name} is arriving in ${etaMinutes} min${etaMinutes === 1 ? "" : "s"}`;
  }
  if (order.status === "ready") return `${name} is arriving soon`;
  return `${name} is on the way`;
}

export function canTrackAssignedRider(order: OrderRecord): boolean {
  if (order.deliveryType !== "GATIMITRA_RIDER") return false;
  if (!orderHasAssignedRider(order)) return false;
  if (order.riderPickedUpAt || order.status === "picked_up") return false;
  return order.status !== "delivered" && order.status !== "rejected" && order.status !== "rto";
}

export function shouldShowPendingRiderAssign(
  order: OrderRecord,
  statuses: Array<OrderRecord["status"]>
): boolean {
  if (order.deliveryType !== "GATIMITRA_RIDER") return false;
  if (orderHasAssignedRider(order)) return false;
  return statuses.includes(order.status);
}

export function apiFoodOrderToRiderLog(order: ApiFoodOrder): FoodOrderRiderLogEntry | null {
  if (order.rider_id == null && !order.rider_name?.trim()) return null;
  const status = (order.rider_assignment_status ?? "ACTIVE").toUpperCase();
  if (status === "CANCELLED" || status === "REJECTED" || status === "UNASSIGNED") {
    return {
      rider_id: Number(order.rider_id ?? 0),
      rider_name: order.rider_name ?? null,
      rider_mobile: order.rider_mobile ?? null,
      selfie_url: order.rider_selfie_url ?? null,
      assignment_status: order.rider_assignment_status ?? "CANCELLED",
      assigned_at: null,
      accepted_at: null,
      rejected_at: status === "REJECTED" ? order.cancelled_at ?? null : null,
      reached_merchant_at: order.rider_reached_at ?? null,
      picked_up_at: order.rider_picked_up_at ?? null,
      delivered_at: order.delivered_at ?? null,
      cancelled_at:
        status === "CANCELLED" || status === "UNASSIGNED"
          ? order.cancelled_at ?? new Date().toISOString()
          : null,
    };
  }
  return {
    rider_id: Number(order.rider_id ?? 0),
    rider_name: order.rider_name ?? null,
    rider_mobile: order.rider_mobile ?? null,
    selfie_url: order.rider_selfie_url ?? null,
    assignment_status: order.rider_assignment_status ?? "ACTIVE",
    assigned_at: null,
    accepted_at: null,
    rejected_at: null,
    reached_merchant_at: order.rider_reached_at ?? null,
    picked_up_at: order.rider_picked_up_at ?? null,
    delivered_at: order.delivered_at ?? null,
    cancelled_at: null,
  };
}
