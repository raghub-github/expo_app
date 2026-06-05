import {
  mapStateMachineStatusToPartnerUi,
  normFoodStatus,
  resolvePartnerPipeline,
} from '@/lib/partner-orders-unify';

export const PREPARING_PIPELINE = new Set(['ACCEPTED', 'PREPARING']);

export const LIVE_SIDEBAR_FILTER_IDS = [
  'NEW_ORDERS',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'RTO',
] as const;

export type LiveSidebarFilterId = (typeof LIVE_SIDEBAR_FILTER_IDS)[number];

export function normOrderStatusForSidebar(s: string | null | undefined): string {
  const mapped = mapStateMachineStatusToPartnerUi(s);
  if (mapped) return mapped;
  return normFoodStatus(s);
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

export function countLiveSidebarPipelineOrders(
  orders: Array<{ order_status?: string | null }>
): number {
  return orders.filter((o) => isLiveSidebarPipelineStatus(o.order_status)).length;
}

export function isLiveSidebarPipelineFromCore(
  foodOrderStatus: string | null | undefined,
  coreStatus: string | null | undefined,
  currentStatus: string | null | undefined
): boolean {
  const ui = resolvePartnerPipeline(foodOrderStatus, coreStatus, currentStatus);
  return isLiveSidebarPipelineStatus(ui);
}
