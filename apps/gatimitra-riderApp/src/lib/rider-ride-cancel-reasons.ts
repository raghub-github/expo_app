/** Offline fallback when cancellation catalog API is unavailable. */
export type RiderCancelReasonItem = {
  id?: number;
  reasonCode: string;
  label: string;
};

export const RIDER_CANCEL_REASON_FALLBACK: RiderCancelReasonItem[] = [
  { reasonCode: "app_rider_vehicle_issue", label: "Vehicle breakdown / issue" },
  { reasonCode: "app_rider_customer_unreachable", label: "Customer not responding" },
  { reasonCode: "app_rider_wrong_pickup", label: "Wrong pickup location" },
  { reasonCode: "app_rider_unsafe_area", label: "Unsafe area" },
  { reasonCode: "app_rider_long_wait", label: "Waiting too long at pickup" },
  { reasonCode: "app_rider_other", label: "Other reason" },
];

export function mapVariantToServiceType(variant: "ride" | "food"): "person_ride" | "food" {
  return variant === "food" ? "food" : "person_ride";
}
