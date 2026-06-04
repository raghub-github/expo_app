import type { RiderOrderSummary } from "@/src/services/api/riderApi";

export type FoodDeliverySuccessParams = {
  orderId: string;
  displayId: string;
  customerName: string;
  merchantName: string;
  totalEarning: string;
  baseEarning: string;
  tipAmount: string;
  distanceKm: string;
  tripMinutes: string;
};

export function buildFoodDeliverySuccessParams(
  order: RiderOrderSummary
): FoodDeliverySuccessParams {
  const startedMs = Date.parse(order.createdAt);
  const tripMinutes = Number.isFinite(startedMs)
    ? Math.max(1, Math.round((Date.now() - startedMs) / 60_000))
    : 0;

  const base = Math.round(order.baseEarning ?? order.estimatedEarning ?? 0);
  const tip = Math.round(order.customerTipAmount ?? 0);
  const total = Math.round(order.totalEarning ?? base + tip);

  const km =
    order.totalDistanceKm ?? order.tripDistanceKm ?? order.distanceKm ?? order.pickupDistanceKm;

  return {
    orderId: order.id,
    displayId: order.formattedOrderId?.trim() || order.id,
    customerName: order.customerName?.trim() || "",
    merchantName: order.merchantName?.trim() || "",
    totalEarning: String(total),
    baseEarning: String(base),
    tipAmount: String(tip),
    distanceKm: km != null && Number.isFinite(Number(km)) ? String(Number(km)) : "",
    tripMinutes: String(tripMinutes),
  };
}

export function parseFoodDeliverySuccessParams(
  raw: Record<string, string | string[] | undefined>
): FoodDeliverySuccessParams {
  const pick = (key: keyof FoodDeliverySuccessParams) => {
    const v = raw[key];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
  };
  return {
    orderId: pick("orderId"),
    displayId: pick("displayId"),
    customerName: pick("customerName"),
    merchantName: pick("merchantName"),
    totalEarning: pick("totalEarning"),
    baseEarning: pick("baseEarning"),
    tipAmount: pick("tipAmount"),
    distanceKm: pick("distanceKm"),
    tripMinutes: pick("tripMinutes"),
  };
}
