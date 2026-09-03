/**
 * Rider Service Eligibility Engine — the single, deterministic, backend-authoritative
 * decision for whether a rider may receive a given service (FOOD | PARCEL | PERSON RIDE)
 * with a given vehicle at a given location.
 *
 * CORE PRINCIPLES (do not regress):
 *  - DOCUMENT VERIFICATION ≠ SERVICE ELIGIBILITY. Verified DL/RC does NOT auto-grant
 *    every service; the engine makes the final decision from documents + vehicle + geo.
 *  - Vehicle class (2W/3W/4W), fuel, and commercial/non-commercial are all inputs.
 *  - DL / RC requirements and the PERSON-RIDE commercial requirement are geo-configurable
 *    (resolved by nearest-ancestor GLOBAL→STATE→DIVISION→DISTRICT→PINCODE inheritance in
 *    the repository; this engine consumes the already-resolved effective policy).
 *  - Rider PREFERENCE (service on/off) is layered ON TOP of eligibility, never the reverse.
 *  - Deterministic rule precedence (see resolveRiderServiceEligibility).
 *
 * This module is PURE (no DB / IO) so it is exhaustively unit-testable. The geo policy is
 * resolved and supplied by riderEligibility.repository.ts; enforcement (order assignment,
 * API) calls this with the resolved policy.
 */

export type EligibilityService = "food" | "parcel" | "person_ride";
export type VehicleClass = "2_wheeler" | "3_wheeler" | "4_wheeler";
/** Normalised ownership for the eligibility decision. */
export type OwnershipType = "commercial" | "non_commercial";

/** Verification+validity state of a document, as resolved by the backend (never the app). */
export type DocState =
  | "verified" // auto (Cashfree) or manually verified, currently valid
  | "pending" // submitted / manual review in progress
  | "failed" // auto/manual rejected or inconclusive
  | "expired" // was verified but past validity
  | "missing"; // not provided

/** How a document gates a service at a location. */
export type DocRequirement = "required" | "optional" | "exempt";

/** Effective (already geo-resolved) eligibility policy for ONE service at ONE location. */
export type ServiceEligibilityPolicy = {
  service: EligibilityService;
  /** Service switched on for this geo node (Prevent Services / enablement). */
  serviceEnabled: boolean;
  /** DL gate. required → must be verified+valid; exempt → ignored; optional → not blocking. */
  dlRequirement: DocRequirement;
  /** RC gate. Same semantics as dlRequirement. */
  rcRequirement: DocRequirement;
  /** When true, only a commercial vehicle is eligible (e.g. Person-Ride in some cities). */
  commercialRequired: boolean;
  /** Vehicle classes allowed for this service at this location. */
  allowedVehicleClasses: VehicleClass[];
  /** Fuel kinds allowed (empty = all). Normalised: "ev" | "petrol" | "cng" | "other". */
  allowedFuelKinds: string[];
  /** Ownership types allowed (empty = all). */
  allowedOwnership: OwnershipType[];
  /** Provenance for audit: which geo node the effective value came from. */
  resolvedGeo?: { level: string; refId: string } | null;
  ruleVersion?: string | null;
};

export type RiderEligibilityInput = {
  vehicleClass: VehicleClass | null;
  /** App/DB vehicle code (bike, auto, ev_car…) — used for the base food-vehicle rule. */
  vehicleType?: string | null;
  fuelKind?: string | null; // "ev" | "petrol" | "cng" | "other"
  ownership: OwnershipType;
  dl: DocState;
  rc: DocState;
};

export type EligibilityBlockCode =
  | "SERVICE_DISABLED"
  | "VEHICLE_CLASS_NOT_ALLOWED"
  | "FUEL_NOT_ALLOWED"
  | "OWNERSHIP_NOT_ALLOWED"
  | "DL_REQUIRED_NOT_VERIFIED"
  | "DL_EXPIRED"
  | "RC_REQUIRED_NOT_VERIFIED"
  | "RC_EXPIRED"
  | "COMMERCIAL_VEHICLE_REQUIRED"
  | "NO_VEHICLE";

export type EligibilityBlock = {
  code: EligibilityBlockCode;
  /** Rider/agent-facing reason (specific, not "document error"). */
  reason: string;
  /** What the rider must do to clear it, when actionable. */
  requiredAction?: string;
};

export type EligibilityDecision = {
  service: EligibilityService;
  eligible: boolean;
  vehicleClass: VehicleClass | null;
  fuelKind: string | null;
  ownership: OwnershipType;
  dlState: DocState;
  rcState: DocState;
  commercialRequired: boolean;
  /** All failed conditions, most-severe first (precedence order). */
  blocking: EligibilityBlock[];
  resolvedGeo?: { level: string; refId: string } | null;
  ruleVersion?: string | null;
};

function docSatisfies(requirement: DocRequirement, state: DocState): {
  ok: boolean;
  expired: boolean;
} {
  if (requirement === "exempt" || requirement === "optional") {
    // Optional never blocks; exempt ignores the doc entirely.
    return { ok: true, expired: false };
  }
  // required:
  if (state === "verified") return { ok: true, expired: false };
  if (state === "expired") return { ok: false, expired: true };
  return { ok: false, expired: false };
}

/**
 * The single deterministic eligibility decision. Precedence (a hard failure stops the
 * decision at `eligible:false`, but ALL blocking reasons are collected for the UI/agent):
 *   1. Service enabled at this geo.
 *   2. A vehicle exists + its class is allowed for this service (compatibility).
 *   3. Document verification + validity (DL, then RC) per the geo requirement.
 *   4. Commercial-vehicle requirement (geo-configurable, e.g. Person-Ride).
 *   5. Fuel + ownership allow-lists.
 * Nothing lower-priority can override a higher hard failure; exemptions are expressed in
 * the policy (requirement = exempt / commercialRequired = false), never hidden in code.
 */
export function resolveRiderServiceEligibility(
  input: RiderEligibilityInput,
  policy: ServiceEligibilityPolicy
): EligibilityDecision {
  const blocking: EligibilityBlock[] = [];
  const fuelKind = (input.fuelKind ?? "").trim().toLowerCase() || null;

  // 1. Service enablement (geo).
  if (!policy.serviceEnabled) {
    blocking.push({
      code: "SERVICE_DISABLED",
      reason: "This service is not available at this location.",
    });
  }

  // 2. Vehicle presence + class compatibility.
  if (!input.vehicleClass) {
    blocking.push({
      code: "NO_VEHICLE",
      reason: "No verified vehicle on file for this service.",
      requiredAction: "Add and verify a vehicle.",
    });
  } else if (!policy.allowedVehicleClasses.includes(input.vehicleClass)) {
    blocking.push({
      code: "VEHICLE_CLASS_NOT_ALLOWED",
      reason: `A ${labelClass(input.vehicleClass)} is not allowed for ${labelService(
        policy.service
      )} at this location.`,
    });
  }

  // 3. Document verification + validity.
  const dl = docSatisfies(policy.dlRequirement, input.dl);
  if (!dl.ok) {
    blocking.push(
      dl.expired
        ? {
            code: "DL_EXPIRED",
            reason: "Driving Licence has expired.",
            requiredAction: "Renew and re-verify your Driving Licence.",
          }
        : {
            code: "DL_REQUIRED_NOT_VERIFIED",
            reason: "Driving Licence verification is required.",
            requiredAction: "Verify your Driving Licence.",
          }
    );
  }
  const rc = docSatisfies(policy.rcRequirement, input.rc);
  if (!rc.ok) {
    blocking.push(
      rc.expired
        ? {
            code: "RC_EXPIRED",
            reason: "Registration Certificate has expired.",
            requiredAction: "Renew and re-verify your RC.",
          }
        : {
            code: "RC_REQUIRED_NOT_VERIFIED",
            reason: "Registration Certificate verification is required.",
            requiredAction: "Verify your Registration Certificate.",
          }
    );
  }

  // 4. Commercial-vehicle requirement (geo-configurable).
  if (policy.commercialRequired && input.ownership !== "commercial") {
    blocking.push({
      code: "COMMERCIAL_VEHICLE_REQUIRED",
      reason: `A commercial vehicle is required for ${labelService(
        policy.service
      )} at this location.`,
      requiredAction: "Register a commercial vehicle for this service.",
    });
  }

  // 5. Fuel + ownership allow-lists (empty list = all allowed).
  if (policy.allowedFuelKinds.length > 0 && fuelKind && !policy.allowedFuelKinds.includes(fuelKind)) {
    blocking.push({
      code: "FUEL_NOT_ALLOWED",
      reason: `${labelFuel(fuelKind)} vehicles are not allowed for ${labelService(
        policy.service
      )} at this location.`,
    });
  }
  if (policy.allowedOwnership.length > 0 && !policy.allowedOwnership.includes(input.ownership)) {
    blocking.push({
      code: "OWNERSHIP_NOT_ALLOWED",
      reason: `${input.ownership === "commercial" ? "Commercial" : "Non-commercial"} vehicles are not allowed for ${labelService(
        policy.service
      )} at this location.`,
    });
  }

  return {
    service: policy.service,
    eligible: blocking.length === 0,
    vehicleClass: input.vehicleClass,
    fuelKind,
    ownership: input.ownership,
    dlState: input.dl,
    rcState: input.rc,
    commercialRequired: policy.commercialRequired,
    blocking,
    resolvedGeo: policy.resolvedGeo ?? null,
    ruleVersion: policy.ruleVersion ?? null,
  };
}

function labelService(s: EligibilityService): string {
  return s === "person_ride" ? "Person Ride" : s === "food" ? "Food" : "Parcel";
}
function labelClass(c: VehicleClass): string {
  return c === "2_wheeler" ? "2-wheeler" : c === "3_wheeler" ? "3-wheeler" : "4-wheeler";
}
function labelFuel(f: string): string {
  return f === "ev" ? "Electric" : f.charAt(0).toUpperCase() + f.slice(1);
}
