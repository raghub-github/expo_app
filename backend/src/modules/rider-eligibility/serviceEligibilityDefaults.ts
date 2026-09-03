/**
 * Default (GLOBAL-fallback) eligibility policy per service — the base business rules
 * used when no geo node (STATE→…→PINCODE) overrides them. These encode the stated
 * defaults but remain fully overridable per geo node in the policy table:
 *
 *  - FOOD: 2-wheeler ONLY (3W/4W never food-eligible), DL required, RC optional,
 *          non-commercial allowed. (Matches rider-dispatch-service-rules food rule.)
 *  - PARCEL: 2W/3W/4W, DL required, RC required, commercial not required by default.
 *  - PERSON RIDE: 2W/3W/4W, DL required, RC required, COMMERCIAL REQUIRED by default
 *          (overridable to false per location — the key geo-configurable rule).
 *
 * NOTHING here is hard-coded in the rider app; these are the seed/fallback values the
 * geo resolver falls back to, and every field is overridable from the Super-Admin
 * Geo & Coverage → Rider Eligibility policy.
 */
import type {
  EligibilityService,
  ServiceEligibilityPolicy,
  VehicleClass,
} from "./eligibilityEngine.js";

export const ALL_ELIGIBILITY_SERVICES: EligibilityService[] = ["food", "parcel", "person_ride"];
export const ALL_VEHICLE_CLASSES: VehicleClass[] = ["2_wheeler", "3_wheeler", "4_wheeler"];

/** Policy shape without the service/geo provenance fields (the configurable columns). */
export type ServiceEligibilityPolicyValues = Omit<
  ServiceEligibilityPolicy,
  "service" | "resolvedGeo" | "ruleVersion"
>;

export const DEFAULT_SERVICE_ELIGIBILITY: Record<
  EligibilityService,
  ServiceEligibilityPolicyValues
> = {
  food: {
    serviceEnabled: true,
    dlRequirement: "required",
    rcRequirement: "optional",
    commercialRequired: false,
    allowedVehicleClasses: ["2_wheeler"],
    allowedFuelKinds: [],
    allowedOwnership: ["commercial", "non_commercial"],
  },
  parcel: {
    serviceEnabled: true,
    dlRequirement: "required",
    rcRequirement: "required",
    commercialRequired: false,
    allowedVehicleClasses: ["2_wheeler", "3_wheeler", "4_wheeler"],
    allowedFuelKinds: [],
    allowedOwnership: ["commercial", "non_commercial"],
  },
  person_ride: {
    serviceEnabled: true,
    dlRequirement: "required",
    rcRequirement: "required",
    commercialRequired: true,
    allowedVehicleClasses: ["2_wheeler", "3_wheeler", "4_wheeler"],
    allowedFuelKinds: [],
    allowedOwnership: ["commercial", "non_commercial"],
  },
};

export function defaultPolicyForService(service: EligibilityService): ServiceEligibilityPolicy {
  return { service, ...DEFAULT_SERVICE_ELIGIBILITY[service], resolvedGeo: null, ruleVersion: "default" };
}

/**
 * Normalise a raw fuel label (fuel_type text/enum: petrol, diesel, electric, cng, ...)
 * to the eligibility fuel kind used by allowedFuelKinds.
 */
export function normalizeFuelKind(raw: string | null | undefined): string | null {
  const f = (raw ?? "").trim().toLowerCase();
  if (!f) return null;
  if (f === "electric" || f === "ev" || f.startsWith("ev_")) return "ev";
  if (f === "petrol" || f === "gasoline") return "petrol";
  if (f === "cng" || f === "lpg") return "cng";
  if (f === "diesel") return "petrol"; // combustion bucket for allow-lists
  return "other";
}
