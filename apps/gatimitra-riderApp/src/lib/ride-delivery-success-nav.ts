import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import {
  buildFoodDeliverySuccessParams,
  type FoodDeliverySuccessParams,
} from "@/src/lib/food-delivery-success-nav";

export type RideDeliverySuccessParams = FoodDeliverySuccessParams;

export function buildRideDeliverySuccessParams(
  order: RiderOrderSummary
): RideDeliverySuccessParams {
  const base = buildFoodDeliverySuccessParams(order);
  const tripKm = order.tripDistanceKm ?? order.distanceKm;
  return {
    ...base,
    distanceKm:
      tripKm != null && Number.isFinite(Number(tripKm)) ? String(Number(tripKm)) : base.distanceKm,
  };
}
