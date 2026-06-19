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

/** Rider at merchant (GPS milestone) — kitchen stage comes from orders_food, not core. */
const RIDER_AT_MERCHANT_CURRENT = new Set(['RIDER_AT_PICKUP', 'REACHED_STORE', 'REACHED_MERCHANT']);

function isRiderAtMerchantCore(coreStatus: string | null | undefined): boolean {
  return String(coreStatus || '').toLowerCase() === 'reached_store';
}

function isRiderAtMerchantCurrent(currentStatus: string | null | undefined): boolean {
  const u = String(currentStatus ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return RIDER_AT_MERCHANT_CURRENT.has(u);
}

function isMerchantMarkedFoodReady(foodOrderStatus: string | null | undefined): boolean {
  return mapStateMachineStatusToPartnerUi(foodOrderStatus) === 'READY_FOR_PICKUP';
}

/** Coarse DB enum → partner UI when current_status is missing */
export function mapCoreStatusToPartnerUi(coreStatus: string | null | undefined): string {
  const s = String(coreStatus || 'assigned').toLowerCase() as CoreOrderStatus;
  switch (s) {
    case 'assigned':
      return 'CREATED';
    case 'accepted':
      return 'ACCEPTED';
    case 'reached_store':
      /* Rider reached pickup — not the same as merchant marking order ready. */
      return 'ACCEPTED';
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
  if (RIDER_AT_MERCHANT_CURRENT.has(u)) return null;
  if (['READY_FOR_PICKUP', 'READY', 'DISPATCH_READY', 'DISPATCHREADY', 'DISPATCH_READY_FOR_PICKUP'].includes(u)) {
    return 'READY_FOR_PICKUP';
  }
  if (
    [
      'OUT_FOR_DELIVERY',
      'PICKED_UP',
      'IN_TRANSIT',
      'ON_THE_WAY',
      'PICKEDUP',
      'DISPATCHED',
      'DESPATCHED',
    ].includes(u)
  ) {
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
const PIPELINE_RANK = [
  'CREATED',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

function pipelineRank(status: string): number {
  const i = PIPELINE_RANK.indexOf(status as (typeof PIPELINE_RANK)[number]);
  return i >= 0 ? i : -1;
}

/** True only when a rider explicitly marked food pickup (OTP/barcode/mark). */
export function hasRiderMarkedFoodPickup(riderPickedUpAt?: string | null): boolean {
  const t = String(riderPickedUpAt ?? '').trim();
  if (!t) return false;
  return Number.isFinite(Date.parse(t));
}

/** Merchant dispatch / core in_transit must not advance tabs until rider pickup is recorded. */
function capPipelineUntilRiderPickup(status: string, riderPickedUpAt?: string | null): string {
  if (status !== 'OUT_FOR_DELIVERY') return status;
  if (hasRiderMarkedFoodPickup(riderPickedUpAt)) return status;
  return 'READY_FOR_PICKUP';
}

/**
 * Resolve partner tab status from orders_core + orders_food.
 * When sources disagree (e.g. dashboard set Dispatched on core but food still READY),
 * use the most advanced non-terminal stage so the order moves to the correct tab.
 */
export function resolvePartnerPipeline(
  foodOrderStatus: string | null | undefined,
  coreStatus: string | null | undefined,
  currentStatus: string | null | undefined,
  riderPickedUpAt?: string | null
): string {
  const cur = mapStateMachineStatusToPartnerUi(currentStatus);
  const fromFood = mapStateMachineStatusToPartnerUi(foodOrderStatus);
  const fromCore = mapCoreStatusToPartnerUi(coreStatus);

  for (const s of [cur, fromFood, fromCore]) {
    if (s === 'CANCELLED' || s === 'RTO') return s;
  }
  if (cur === 'DELIVERED' || fromFood === 'DELIVERED' || fromCore === 'DELIVERED') {
    return 'DELIVERED';
  }

  let best = fromCore;
  for (const s of [cur, fromFood, fromCore]) {
    if (!s) continue;
    if (pipelineRank(s) > pipelineRank(best)) best = s;
  }

  const riderAtMerchant =
    isRiderAtMerchantCore(coreStatus) || isRiderAtMerchantCurrent(currentStatus);
  if (
    riderAtMerchant &&
    !isMerchantMarkedFoodReady(foodOrderStatus) &&
    pipelineRank(best) >= pipelineRank('READY_FOR_PICKUP')
  ) {
    if (fromFood && pipelineRank(fromFood) >= 0) {
      return capPipelineUntilRiderPickup(fromFood, riderPickedUpAt);
    }
    if (cur && pipelineRank(cur) >= 0 && cur !== 'READY_FOR_PICKUP') {
      return capPipelineUntilRiderPickup(cur, riderPickedUpAt);
    }
    return 'PREPARING';
  }

  return capPipelineUntilRiderPickup(best || 'CREATED', riderPickedUpAt);
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
