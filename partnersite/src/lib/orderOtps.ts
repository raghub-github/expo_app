import type { OrdersFoodRow } from '@/hooks/useFoodOrders';

export type CachedOrderOtps = {
  pickup?: string | null;
  rto?: string | null;
  pickupVerified?: boolean;
  rtoVerified?: boolean;
};

export type OrderOtpBundle = {
  pickup: string | null;
  rto: string | null;
};

export function resolveOrderOtps(order: OrdersFoodRow, cache?: CachedOrderOtps): OrderOtpBundle {
  return {
    pickup: order.pickup_otp ?? cache?.pickup ?? null,
    rto: order.rto_otp ?? cache?.rto ?? null,
  };
}

/** Pickup OTP: show once order is accepted through dispatch (merchant handover to rider). */
export function shouldShowPickupOtp(status: string, pickup: string | null): boolean {
  if (!pickup) return false;
  const s = status.toUpperCase();
  if (s === 'CANCELLED' || s === 'DELIVERED' || s === 'RTO') return false;
  return ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'CREATED', 'NEW'].includes(s);
}

/** RTO OTP row when an RTO code exists on the order. */
export function shouldShowRtoOtp(_status: string, rto: string | null): boolean {
  return !!rto;
}

/** Mask RTO OTP until order status is RTO. */
export function formatRtoOtpDisplay(status: string, rto: string | null): string | null {
  if (!rto) return null;
  return status.toUpperCase() === 'RTO' ? rto : 'XXXX';
}
