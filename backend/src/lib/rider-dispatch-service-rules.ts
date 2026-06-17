import { catalogCodeToPricingVehicle } from "../modules/ride-state-config/catalogVehicleMap.js";

export type RiderDispatchService = "food" | "parcel" | "person_ride";

/** App / DB vehicle codes that may receive food dispatch (2-wheeler only). */
const FOOD_ELIGIBLE_VEHICLE_TYPES = new Set([
  "bike",
  "bike-lite",
  "ev_bike",
  "cycle",
  "scooter",
  "e_cycle",
  "bicycle",
]);

/** Known 3/4-wheeler codes — never food-eligible even if missing from catalog map. */
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

function isNonFoodVehicleCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  const c = category.trim().toLowerCase();
  if (c === "3_wheeler" || c === "4_wheeler" || c.startsWith("4_wheeler")) return true;
  // Legacy vehicle_category enum labels (dashboard / Supabase)
  return c === "auto" || c === "cab" || c === "taxi";
}

export function isVehicleTypeFoodDispatchEligible(vehicleType: string): boolean {
  const code = vehicleType.trim().toLowerCase();
  if (!code) return false;
  if (FOOD_INELIGIBLE_VEHICLE_TYPES.has(code)) return false;

  const pricing = catalogCodeToPricingVehicle(code);
  if (pricing) return pricing === "2_wheeler";

  return FOOD_ELIGIBLE_VEHICLE_TYPES.has(code);
}

export function riderProfileBlocksFoodDispatch(input: {
  vehicleTypes: string[];
  vehicleCategories?: Array<string | null | undefined>;
}): boolean {
  if (input.vehicleCategories?.some(isNonFoodVehicleCategory)) return true;
  if (input.vehicleTypes.length === 0) return false;
  return input.vehicleTypes.every((vt) => !isVehicleTypeFoodDispatchEligible(vt));
}

export function filterDispatchServicesForRiderProfile<T extends RiderDispatchService>(
  services: T[],
  input: { vehicleTypes: string[]; vehicleCategories?: Array<string | null | undefined> }
): T[] {
  if (!services.includes("food" as T)) return services;
  if (riderProfileBlocksFoodDispatch(input)) {
    return services.filter((s) => s !== "food");
  }
  return services;
}

const ALL_DISPATCH_SERVICES: RiderDispatchService[] = ["food", "parcel", "person_ride"];

/**
 * When rider_vehicles.service_types is empty, derive capabilities from vehicle profile.
 * Never infer from duty selection — duty ∩ vehicle defines eligibility.
 */
export function deriveVehicleDispatchServicesFromProfile(input: {
  vehicleTypes: string[];
  vehicleCategories?: Array<string | null | undefined>;
}): RiderDispatchService[] {
  if (riderProfileBlocksFoodDispatch(input)) {
    return ["parcel", "person_ride"];
  }
  if (input.vehicleTypes.length === 0 && !(input.vehicleCategories?.length ?? 0)) {
    return [];
  }
  return [...ALL_DISPATCH_SERVICES];
}
