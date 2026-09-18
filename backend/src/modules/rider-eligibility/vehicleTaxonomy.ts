/**
 * Canonical vehicle taxonomy + add-vehicle rules (§3, §15, §31, §32) — the ONE place that
 * decides "what class is this vehicle" and "may this rider add it". Pure + deterministic so
 * the backend (add-vehicle endpoint) and tests share the exact logic; the app never decides.
 */
import { vehicleClassFromCategory } from "./riderEligibilityInputs.js";
import type { VehicleClass } from "./eligibilityEngine.js";

export const MAX_ACTIVE_VEHICLES = 2;

const VEHICLE_CLASS_LABEL: Record<VehicleClass, string> = {
  "2_wheeler": "2 Wheeler",
  "3_wheeler": "3 Wheeler",
  "4_wheeler": "4 Wheeler",
};

export function vehicleClassDisplayLabel(cls: VehicleClass | null | undefined): string {
  if (!cls) return "vehicle";
  return VEHICLE_CLASS_LABEL[cls];
}

/** Uppercase + strip every non-alphanumeric so "HR-01-AB-1234" == "hr01ab1234". */
export function normalizeRegistrationNumber(raw: string | null | undefined): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Canonical 2W/3W/4W from Cashfree/VAHAN `vehicle_class` (and related fields).
 * Used when adding a second RC — never trust the rider's onboarding bike choice.
 */
export function canonicalClassFromCashfreeRc(data: {
  vehicle_class?: unknown;
  class?: unknown;
  vehicle_category?: unknown;
  body_type?: unknown;
} | null | undefined): VehicleClass | null {
  if (!data) return null;
  const raw = [data.vehicle_class, data.class, data.vehicle_category, data.body_type]
    .map((v) => String(v ?? "").trim().toUpperCase())
    .filter(Boolean)
    .join(" | ");
  if (!raw) return null;
  if (
    /\b(3WN|3WT|3W\b|THREE[\s-]*WHEEL|AUTO\s*RICK|E-?RICK|LMV[\s-]*3|3[\s-]*WHEELER)/.test(raw)
  ) {
    return "3_wheeler";
  }
  if (
    /\b(M-?CYCLE|MCWG|MCWOG|SCOOTER|MOPED|TWO[\s-]*WHEEL|2W\b|LMV[\s-]*TW|MOTOR\s*CYCLE|2[\s-]*WHEELER)/.test(
      raw,
    )
  ) {
    return "2_wheeler";
  }
  if (
    /\b(LMV|MOTOR\s*CAR|MOTOR\s*CAB|MGV|HGV|LPV|LCV|FOUR[\s-]*WHEEL|4W\b|CAR\b|CAB\b|TAXI|JEEP|4[\s-]*WHEELER)/.test(
      raw,
    )
  ) {
    return "4_wheeler";
  }
  return null;
}

export type VehicleForTaxonomy = {
  registrationNumber?: string | null;
  vehicleCategory?: string | null;
  vehicleType?: string | null;
};

/** Canonical class (2_wheeler | 3_wheeler | 4_wheeler) — never a display name. */
export function canonicalVehicleClass(v: VehicleForTaxonomy): VehicleClass | null {
  return vehicleClassFromCategory(v.vehicleCategory ?? null, v.vehicleType ?? null);
}

export type AddVehicleCheck =
  | { ok: true }
  | { ok: false; code: "MAX_VEHICLES" | "INVALID_REGISTRATION" | "DUPLICATE_RC" | "SAME_VEHICLE_CLASS" | "UNKNOWN_VEHICLE_CLASS"; reason: string };

/**
 * May this rider add `candidate` given their `existing` (non-retired) vehicles?
 * Enforces: max 2 (§31), no duplicate RC by normalised number (§15), and no second
 * vehicle of the SAME canonical class (§3, §32) — bike+bike rejected, bike+car allowed.
 */
export function canAddVehicle(args: {
  existing: VehicleForTaxonomy[];
  candidate: VehicleForTaxonomy;
  max?: number;
}): AddVehicleCheck {
  const max = args.max ?? MAX_ACTIVE_VEHICLES;
  if (args.existing.length >= max) {
    return { ok: false, code: "MAX_VEHICLES", reason: `Maximum ${max} vehicles are allowed.` };
  }
  const candReg = normalizeRegistrationNumber(args.candidate.registrationNumber);
  if (!candReg) {
    return { ok: false, code: "INVALID_REGISTRATION", reason: "A valid registration number is required." };
  }
  if (args.existing.some((e) => normalizeRegistrationNumber(e.registrationNumber) === candReg)) {
    return { ok: false, code: "DUPLICATE_RC", reason: "This vehicle is already added to your account." };
  }
  const candClass = canonicalVehicleClass(args.candidate);
  if (candClass && args.existing.some((e) => canonicalVehicleClass(e) === candClass)) {
    const label = vehicleClassDisplayLabel(candClass);
    return {
      ok: false,
      code: "SAME_VEHICLE_CLASS",
      reason: `You already have a ${label} registered. Your second vehicle must be a different vehicle type.`,
    };
  }
  return { ok: true };
}
