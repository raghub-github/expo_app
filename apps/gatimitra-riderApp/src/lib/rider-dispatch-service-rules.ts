/** Mirror of backend rider-dispatch-service-rules — food only for 2-wheeler vehicles. */

const FOOD_ELIGIBLE_VEHICLE_TYPES = new Set([
  "bike",
  "bike-lite",
  "ev_bike",
  "cycle",
  "scooter",
  "e_cycle",
  "bicycle",
]);

const FOOD_INELIGIBLE_VEHICLE_TYPES = new Set([
  "auto",
  "cng_auto",
  "ev_auto",
  "e_rickshaw",
  "cargo_auto",
  "loader_auto",
  "car",
  "taxi",
  "ev_car",
  "tata_ace",
  "pickup",
  "cargo_van",
  "mini_truck",
  "cab-economy",
  "cab-premium",
  "travel",
]);

export function isVehicleTypeFoodDispatchEligible(vehicleType: string): boolean {
  const code = vehicleType.trim().toLowerCase();
  if (!code) return false;
  if (FOOD_INELIGIBLE_VEHICLE_TYPES.has(code)) return false;
  return FOOD_ELIGIBLE_VEHICLE_TYPES.has(code);
}

export function riderVehicleBlocksFoodDispatch(vehicleType: string | null | undefined): boolean {
  if (!vehicleType?.trim()) return false;
  return !isVehicleTypeFoodDispatchEligible(vehicleType);
}
