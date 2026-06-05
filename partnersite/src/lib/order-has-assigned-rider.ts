import type { OrdersFoodRow } from '@/hooks/useFoodOrders';

/** True when this food order has a delivery partner assigned (tracking map can preload). */
export function orderHasAssignedRider(order: OrdersFoodRow | null | undefined): boolean {
  if (!order) return false;
  if (order.rider_id != null && Number(order.rider_id) > 0) return true;
  if (order.rider_name?.trim()) return true;
  if (order.rider_details?.name?.trim()) return true;
  return false;
}
