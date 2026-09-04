/**
 * Pure mappers from raw rider/vehicle/document data → the eligibility engine's inputs.
 * Verification state is resolved by the backend (KYC tables / rider status) and passed
 * in here; this module never trusts the app for verification.
 */
import { catalogCodeToPricingVehicle } from "../ride-state-config/catalogVehicleMap.js";
import type { DocState, OwnershipType, VehicleClass } from "./eligibilityEngine.js";

/**
 * Canonical 2W/3W/4W class from rider_vehicles.vehicle_category (+ optional vehicle
 * type code). Handles both the normalised "N_wheeler" categories and legacy enum
 * labels (auto/cab/taxi), and falls back to the pricing-vehicle map by code.
 */
export function vehicleClassFromCategory(
  vehicleCategory: string | null | undefined,
  vehicleType?: string | null
): VehicleClass | null {
  const c = (vehicleCategory ?? "").trim().toLowerCase();
  if (c === "2_wheeler" || c === "two_wheeler" || c === "bike" || c === "scooter") return "2_wheeler";
  if (c === "3_wheeler" || c === "three_wheeler" || c === "auto") return "3_wheeler";
  if (c === "4_wheeler" || c === "four_wheeler" || c.startsWith("4_wheeler") || c === "cab" || c === "car" || c === "taxi")
    return "4_wheeler";

  const code = (vehicleType ?? "").trim().toLowerCase();
  if (code) {
    // The pricing map splits 4-wheelers into ac/non_ac; both are the 4_wheeler class.
    const pricing = catalogCodeToPricingVehicle(code);
    if (pricing === "2_wheeler") return "2_wheeler";
    if (pricing === "3_wheeler") return "3_wheeler";
    if (pricing?.startsWith("4_wheeler")) return "4_wheeler";
  }
  return null;
}

export function ownershipFromVehicle(isCommercial: boolean | null | undefined): OwnershipType {
  return isCommercial === true ? "commercial" : "non_commercial";
}

/**
 * Per-vehicle RC DocState from the vehicle row itself (multi-vehicle: each vehicle carries
 * its own RC verification + fitness/permit validity). A vehicle row always has a
 * registration number, so the floor is "pending" (submitted, awaiting), never "missing".
 */
export function rcDocStateFromVehicle(
  v: {
    verified?: boolean | null;
    fitnessExpiry?: string | Date | null;
    permitExpiry?: string | Date | null;
  },
  now: Date = new Date()
): DocState {
  const verified = v.verified === true;
  const isExpired = (d: string | Date | null | undefined): boolean => {
    if (!d) return false;
    const t = d instanceof Date ? d.getTime() : new Date(String(d)).getTime();
    return Number.isFinite(t) && t < now.getTime();
  };
  const expired = isExpired(v.fitnessExpiry) || isExpired(v.permitExpiry);
  return docStateFrom({ verified, submitted: true, expired });
}

/**
 * Resolve a document's DocState from backend verification signals. `verified` is the
 * authoritative flag (Cashfree auto or manual approval). Priority: expired > verified >
 * submitted(pending) > rejected(failed) > missing.
 */
export function docStateFrom(input: {
  verified?: boolean | null;
  expired?: boolean | null;
  submitted?: boolean | null;
  rejected?: boolean | null;
}): DocState {
  if (input.expired === true) return "expired";
  if (input.verified === true) return "verified";
  if (input.rejected === true) return "failed";
  if (input.submitted === true) return "pending";
  return "missing";
}
