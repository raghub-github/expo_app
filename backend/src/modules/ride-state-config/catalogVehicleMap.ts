import type { RideVehiclePricingType } from "../rider-payout-pricing/types.js";

/** Customer catalog option code → pricing vehicle enum. */
export const CATALOG_CODE_TO_PRICING_VEHICLE: Record<string, RideVehiclePricingType> = {
  bike: "2_wheeler",
  "bike-lite": "2_wheeler",
  ev_bike: "2_wheeler",
  cycle: "2_wheeler",
  scooter: "2_wheeler",
  e_cycle: "2_wheeler",
  bicycle: "2_wheeler",
  auto: "3_wheeler",
  cng_auto: "3_wheeler",
  ev_auto: "3_wheeler",
  e_rickshaw: "3_wheeler",
  cargo_auto: "3_wheeler",
  loader_auto: "3_wheeler",
  car: "4_wheeler_non_ac",
  taxi: "4_wheeler_ac",
  ev_car: "4_wheeler_ac",
  tata_ace: "4_wheeler_non_ac",
  pickup: "4_wheeler_non_ac",
  cargo_van: "4_wheeler_non_ac",
  mini_truck: "4_wheeler_non_ac",
  "cab-economy": "4_wheeler_non_ac",
  "cab-premium": "4_wheeler_ac",
  travel: "4_wheeler_ac",
};

export function catalogCodeToPricingVehicle(catalogCode: string): RideVehiclePricingType | null {
  return CATALOG_CODE_TO_PRICING_VEHICLE[catalogCode] ?? null;
}

export function pricingVehicleMatchesScope(
  pricingVehicle: RideVehiclePricingType,
  scope: string
): boolean {
  if (scope === "all") return true;
  return pricingVehicle === scope;
}
