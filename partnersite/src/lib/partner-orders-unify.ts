/**
 * Partner pipeline uses orders_core.current_status (PLACED, ACCEPTED, PREPARING, …) as the
 * source of truth when set; orders_core.status is a coarser rider/lifecycle enum (assigned, …).
 * orders_food.order_status is aligned when present but may lag or use different spellings.
 */

export type CoreOrderStatus =
  | 'assigned'
  | 'accepted'
  | 'reached_store'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'
  | 'failed';

/** Coarse DB enum → partner UI when current_status is missing */
export function mapCoreStatusToPartnerUi(coreStatus: string | null | undefined): string {
  const s = String(coreStatus || 'assigned').toLowerCase() as CoreOrderStatus;
  switch (s) {
    case 'assigned':
      return 'CREATED';
    case 'accepted':
      return 'ACCEPTED';
    case 'reached_store':
      return 'READY_FOR_PICKUP';
    case 'picked_up':
    case 'in_transit':
      return 'OUT_FOR_DELIVERY';
    case 'delivered':
      return 'DELIVERED';
    case 'cancelled':
      return 'CANCELLED';
    case 'failed':
      return 'RTO';
    default:
      return 'CREATED';
  }
}

export function normFoodStatus(s: string | null | undefined): string {
  const u = String(s || 'CREATED').toUpperCase();
  return u === 'NEW' ? 'CREATED' : u;
}

/**
 * Map order_events / kitchen strings (PLACED, ACCEPTED, …) → partner tab filter codes.
 * Returns one of: CREATED | ACCEPTED | PREPARING | READY_FOR_PICKUP | OUT_FOR_DELIVERY | DELIVERED | CANCELLED | RTO
 */
export function mapStateMachineStatusToPartnerUi(raw: string | null | undefined): string | null {
  const u = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (!u) return null;

  if (['PLACED', 'CREATED', 'ORDER_RECEIVED', 'ORDER_PLACED', 'NEW'].includes(u)) return 'CREATED';
  if (u === 'ACCEPTED') return 'ACCEPTED';
  if (u === 'PREPARING') return 'PREPARING';
  if (['READY_FOR_PICKUP', 'READY', 'DISPATCH_READY', 'DISPATCHREADY', 'DISPATCH_READY_FOR_PICKUP'].includes(u)) {
    return 'READY_FOR_PICKUP';
  }
  if (['OUT_FOR_DELIVERY', 'PICKED_UP', 'IN_TRANSIT', 'ON_THE_WAY', 'PICKEDUP'].includes(u)) {
    return 'OUT_FOR_DELIVERY';
  }
  if (u === 'DELIVERED') return 'DELIVERED';
  if (u === 'CANCELLED') return 'CANCELLED';
  if (['RTO', 'FAILED', 'FAILURE'].includes(u)) return 'RTO';

  /* Already partner filter codes */
  if (['CREATED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RTO'].includes(u)) {
    return u;
  }
  return null;
}

/**
 * Single pipeline status for tabs + modal:
 * 1) orders_core.current_status (PLACED, ACCEPTED, …)
 * 2) orders_food.order_status
 * 3) orders_core.status (assigned, …)
 */
export function resolvePartnerPipeline(
  foodOrderStatus: string | null | undefined,
  coreStatus: string | null | undefined,
  currentStatus: string | null | undefined
): string {
  const cur = mapStateMachineStatusToPartnerUi(currentStatus);
  if (cur) return cur;

  const fromFood = mapStateMachineStatusToPartnerUi(foodOrderStatus);
  if (fromFood) return fromFood;

  return mapCoreStatusToPartnerUi(coreStatus);
}

/** @deprecated use resolvePartnerPipeline */
export function resolvePartnerOrderStatus(
  foodOrderStatus: string | null | undefined,
  coreStatus: string | null | undefined
): string {
  return resolvePartnerPipeline(foodOrderStatus, coreStatus, null);
}

/** Map partner UI / orders_food-style status to orders_core.status for rows without orders_food. */
export function mapPartnerUiToCoreStatus(ui: string): CoreOrderStatus {
  const u = normFoodStatus(ui);
  switch (u) {
    case 'CREATED':
      return 'assigned';
    case 'ACCEPTED':
    case 'PREPARING':
      return 'accepted';
    case 'READY_FOR_PICKUP':
      return 'reached_store';
    case 'OUT_FOR_DELIVERY':
      return 'picked_up';
    case 'DELIVERED':
      return 'delivered';
    case 'CANCELLED':
      return 'cancelled';
    case 'RTO':
      return 'failed';
    default:
      return 'assigned';
  }
}
