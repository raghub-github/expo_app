import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import {
  buildFoodDeliverySuccessParams,
  type FoodDeliverySuccessParams,
} from "@/src/lib/food-delivery-success-nav";

export type RideDeliverySuccessParams = FoodDeliverySuccessParams;

export function buildRideDeliverySuccessParams(
  order: RiderOrderSummary
): RideDeliverySuccessParams {
  return buildFoodDeliverySuccessParams(order);
}
