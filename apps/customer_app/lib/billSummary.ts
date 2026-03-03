/**
 * Bill summary engine: item_total + delivery_fee + platform_fee + gst - discounts = final_total.
 * Realtime updates when cart, address, or coupon changes.
 */

const PLATFORM_FEE_FIXED = 12.5;
const GST_RATE = 0.05; // 5%
const DELIVERY_FEE_BASE = 25;
const DELIVERY_FEE_PER_KM = 5;
const MAX_DELIVERY_FEE = 80;
const SERVICE_RADIUS_KM = 15;

export type BillSummaryInput = {
  itemTotal: number;
  deliveryDistanceKm: number | null;
  couponDiscount: number;
};

export type BillSummary = {
  itemTotal: number;
  deliveryFee: number;
  platformFee: number;
  gst: number;
  discount: number;
  finalTotal: number;
  /** Delivery distance beyond SERVICE_RADIUS_KM → out of range */
  isOutOfRange: boolean;
};

export function computeBillSummary(input: BillSummaryInput): BillSummary {
  const { itemTotal, deliveryDistanceKm, couponDiscount } = input;
  const isOutOfRange =
    deliveryDistanceKm != null && deliveryDistanceKm > SERVICE_RADIUS_KM;

  const deliveryFee =
    deliveryDistanceKm == null
      ? DELIVERY_FEE_BASE
      : Math.min(
          MAX_DELIVERY_FEE,
          Math.round(DELIVERY_FEE_BASE + deliveryDistanceKm * DELIVERY_FEE_PER_KM)
        );

  const subtotalBeforeTax = itemTotal + deliveryFee + PLATFORM_FEE_FIXED;
  const gst = Math.round(subtotalBeforeTax * GST_RATE * 100) / 100;
  const discount = Math.min(couponDiscount, itemTotal + deliveryFee);
  const finalTotal = Math.round((subtotalBeforeTax + gst - discount) * 100) / 100;

  return {
    itemTotal,
    deliveryFee,
    platformFee: PLATFORM_FEE_FIXED,
    gst,
    discount,
    finalTotal: Math.max(0, finalTotal),
    isOutOfRange,
  };
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export { SERVICE_RADIUS_KM };
