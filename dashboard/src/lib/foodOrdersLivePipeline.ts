import {
  mapStateMachineStatusToPartnerUi,
  normFoodStatus,
  resolvePartnerPipeline,
} from '@/lib/partner-orders-unify';

/** Accepted by merchant and in kitchen prep (excludes unaccepted “new” rows). */
export const PREPARING_PIPELINE = new Set(['ACCEPTED', 'PREPARING']);

export const LIVE_SIDEBAR_FILTER_IDS = [
  'NEW_ORDERS',
  'SCHEDULED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'RTO',
] as const;

export type LiveSidebarFilterId = (typeof LIVE_SIDEBAR_FILTER_IDS)[number];

/** Same normalization as food-orders sidebar tabs. */
export function normOrderStatusForSidebar(s: string | null | undefined): string {
  const mapped = mapStateMachineStatusToPartnerUi(s);
  if (mapped) return mapped;
  return normFoodStatus(s);
}

/** Effective tab status — merges orders_food, orders_core.status, and current_status. */
export function resolveOrderSidebarPipelineStatus(order: {
  order_status?: string | null;
  core_status?: string | null;
  current_status?: string | null;
  rider_picked_up_at?: string | null;
}): string {
  return resolvePartnerPipeline(
    order.order_status,
    order.core_status ?? null,
    order.current_status ?? null,
    order.rider_picked_up_at ?? null
  );
}

/** Future-dated new orders (ready time well after placement). */
export function isScheduledFoodOrder(order: {
  order_status?: string | null;
  core_status?: string | null;
  current_status?: string | null;
  rider_picked_up_at?: string | null;
  created_at?: string | null;
  expected_ready_at?: string | null;
  prep_ready_by_at?: string | null;
}): boolean {
  const st = resolveOrderSidebarPipelineStatus(order);
  if (st !== 'CREATED') return false;
  const readyRaw = order.expected_ready_at || order.prep_ready_by_at;
  if (!readyRaw || !order.created_at) return false;
  const readyMs = new Date(readyRaw).getTime();
  const createdMs = new Date(order.created_at).getTime();
  if (!Number.isFinite(readyMs) || !Number.isFinite(createdMs)) return false;
  return readyMs - createdMs > 45 * 60 * 1000;
}

export function pipelineTabForSidebarStatus(
  status: string | null | undefined
): LiveSidebarFilterId | null {
  const st = normOrderStatusForSidebar(status ?? '');
  if (st === 'CREATED') return 'NEW_ORDERS';
  if (PREPARING_PIPELINE.has(st)) return 'PREPARING';
  if (st === 'READY_FOR_PICKUP') return 'READY_FOR_PICKUP';
  if (st === 'OUT_FOR_DELIVERY') return 'OUT_FOR_DELIVERY';
  if (st === 'RTO') return 'RTO';
  return null;
}

export function orderMatchesLiveSidebarFilter(
  order: {
    order_status?: string | null;
    core_status?: string | null;
    current_status?: string | null;
    rider_picked_up_at?: string | null;
    created_at?: string | null;
    expected_ready_at?: string | null;
    prep_ready_by_at?: string | null;
  },
  filterId: LiveSidebarFilterId | string
): boolean {
  const st = resolveOrderSidebarPipelineStatus(order);
  if (filterId === 'SCHEDULED') return isScheduledFoodOrder(order);
  if (filterId === 'NEW_ORDERS') return st === 'CREATED' && !isScheduledFoodOrder(order);
  if (filterId === 'PREPARING') return PREPARING_PIPELINE.has(st);
  if (filterId === 'READY_FOR_PICKUP') return st === 'READY_FOR_PICKUP';
  if (filterId === 'OUT_FOR_DELIVERY') return st === 'OUT_FOR_DELIVERY';
  if (filterId === 'RTO') return st === 'RTO';
  return false;
}

export function isLiveSidebarPipelineStatus(status: string | null | undefined): boolean {
  const st = normOrderStatusForSidebar(status);
  return (
    st === 'CREATED' ||
    PREPARING_PIPELINE.has(st) ||
    st === 'READY_FOR_PICKUP' ||
    st === 'OUT_FOR_DELIVERY' ||
    st === 'RTO'
  );
}

/** Count pending live-board orders (today + older) — sum of sidebar tab buckets. */
export function countLiveSidebarPipelineOrders(
  orders: Array<{
    order_status?: string | null;
    core_status?: string | null;
    current_status?: string | null;
    rider_picked_up_at?: string | null;
  }>
): number {
  return orders.filter((o) =>
    isLiveSidebarPipelineStatus(resolveOrderSidebarPipelineStatus(o))
  ).length;
}

export function liveSidebarFilterCounts(
  orders: Array<{
    order_status?: string | null;
    core_status?: string | null;
    current_status?: string | null;
    rider_picked_up_at?: string | null;
    created_at?: string | null;
    expected_ready_at?: string | null;
    prep_ready_by_at?: string | null;
  }>
): Record<LiveSidebarFilterId, number> {
  return {
    NEW_ORDERS: orders.filter((o) => orderMatchesLiveSidebarFilter(o, 'NEW_ORDERS')).length,
    SCHEDULED: orders.filter((o) => orderMatchesLiveSidebarFilter(o, 'SCHEDULED')).length,
    PREPARING: orders.filter((o) => orderMatchesLiveSidebarFilter(o, 'PREPARING')).length,
    READY_FOR_PICKUP: orders.filter((o) => orderMatchesLiveSidebarFilter(o, 'READY_FOR_PICKUP')).length,
    OUT_FOR_DELIVERY: orders.filter((o) => orderMatchesLiveSidebarFilter(o, 'OUT_FOR_DELIVERY')).length,
    RTO: orders.filter((o) => orderMatchesLiveSidebarFilter(o, 'RTO')).length,
  };
}

export function isLiveSidebarPipelineFromCore(
  foodOrderStatus: string | null | undefined,
  coreStatus: string | null | undefined,
  currentStatus: string | null | undefined,
  riderPickedUpAt?: string | null
): boolean {
  const ui = resolvePartnerPipeline(foodOrderStatus, coreStatus, currentStatus, riderPickedUpAt);
  return isLiveSidebarPipelineStatus(ui);
}
