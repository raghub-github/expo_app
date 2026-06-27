import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import { resolveRiderDisplayedEarning } from "@/src/lib/rider-earning-display";

export type FoodDeliverySuccessParams = {
  orderId: string;
  displayId: string;
  customerName: string;
  merchantName: string;
  rideType: string;
  totalEarning: string;
  baseEarning: string;
  tipAmount: string;
  waitingEarning: string;
  surgeEarning: string;
  appliedSurgesJson: string;
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

  const base = Math.round(Number(order.baseEarning) || 0);
  const tip = Math.round(Number(order.customerTipAmount) || 0);
  const waiting = Math.round(Number(order.waitingEarning) || 0);
  const surge = Math.round(Number(order.surgeEarning) || 0);
  const total = resolveRiderDisplayedEarning(order);

  const km =
    order.totalDistanceKm ?? order.tripDistanceKm ?? order.distanceKm ?? order.pickupDistanceKm;

  return {
    orderId: order.id,
    displayId: order.formattedOrderId?.trim() || order.id,
    customerName: order.customerName?.trim() || "",
    merchantName: order.merchantName?.trim() || "",
    rideType: order.rideType?.trim() || "",
    totalEarning: String(total),
    baseEarning: String(base),
    tipAmount: String(tip),
    waitingEarning: String(waiting),
    surgeEarning: String(surge),
    appliedSurgesJson: JSON.stringify(order.appliedSurges ?? []),
    distanceKm: km != null && Number.isFinite(Number(km)) ? String(Number(km)) : "",
    tripMinutes: String(tripMinutes),
  };
}

export function riderEarningLikeFromDeliverySuccessParams(
  params: FoodDeliverySuccessParams
): Pick<
  RiderOrderSummary,
  | "totalEarning"
  | "estimatedEarning"
  | "baseEarning"
  | "waitingEarning"
  | "surgeEarning"
  | "customerTipAmount"
  | "appliedSurges"
> {
  let appliedSurges: { name: string; amount: number }[] = [];
  try {
    const parsed = JSON.parse(params.appliedSurgesJson || "[]") as unknown;
    if (Array.isArray(parsed)) {
      appliedSurges = parsed
        .map((line) => {
          if (line == null || typeof line !== "object") return null;
          const row = line as { name?: unknown; amount?: unknown };
          const name = String(row.name ?? "").trim();
          const amount = Number(row.amount);
          if (!name || !Number.isFinite(amount) || amount <= 0) return null;
          return { name, amount: Math.round(amount) };
        })
        .filter((x): x is { name: string; amount: number } => x != null);
    }
  } catch {
    appliedSurges = [];
  }

  const total = Number(params.totalEarning) || 0;
  return {
    totalEarning: total > 0 ? total : undefined,
    estimatedEarning: total > 0 ? total : 0,
    baseEarning: Number(params.baseEarning) || 0,
    waitingEarning: Number(params.waitingEarning) || 0,
    surgeEarning: Number(params.surgeEarning) || 0,
    customerTipAmount: Number(params.tipAmount) || 0,
    appliedSurges: appliedSurges.length > 0 ? appliedSurges : undefined,
  };
}

export function resolveRiderDeliveryTipAmount(
  orderDetail: Pick<RiderOrderSummary, "customerTipAmount"> | null | undefined,
  paramsTipAmount: number
): number {
  const fromOrder = Math.round(Number(orderDetail?.customerTipAmount) || 0);
  const fromParams = Math.round(Number(paramsTipAmount) || 0);
  return Math.max(fromOrder, fromParams);
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
    rideType: pick("rideType"),
    totalEarning: pick("totalEarning"),
    baseEarning: pick("baseEarning"),
    tipAmount: pick("tipAmount"),
    waitingEarning: pick("waitingEarning"),
    surgeEarning: pick("surgeEarning"),
    appliedSurgesJson: pick("appliedSurgesJson"),
    distanceKm: pick("distanceKm"),
    tripMinutes: pick("tripMinutes"),
  };
}
