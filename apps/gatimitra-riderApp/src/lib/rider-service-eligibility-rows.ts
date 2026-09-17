/**
 * Pure resolver for the rider service dropdown rows.
 *
 * Backend eligibility is authoritative for locked vs selectable.
 * Rider toggle (selectedServices) is layered on top — an eligible service that
 * is not currently selected is ELIGIBLE_OFF, never "not eligible".
 *
 * The legacy client duty pool (geo coverage ∩ vehicle.serviceTypes ∩ category
 * assignments) must not hide a service the engine says is eligible.
 */
import type { RiderServiceTypeValue } from "./rider-vehicle-form";

export type EligibilityReason = { code: string; reason: string; requiredAction?: string };
export type BackendServiceDecision = { eligible: boolean; blocking: EligibilityReason[] };
export type BackendEligibilityByService = Partial<Record<RiderServiceTypeValue, BackendServiceDecision>>;

export type ServiceRowState = "selectable" | "blocked";
export type ServiceEligibilityRow = {
  service: RiderServiceTypeValue;
  state: ServiceRowState;
  /** Populated only when state === "blocked". */
  reasons: EligibilityReason[];
};

export const RIDER_SERVICE_DISPLAY_ORDER: RiderServiceTypeValue[] = ["food", "parcel", "person_ride"];

/** Fallback shown when a service is blocked for a reason the engine doesn't model
 * (e.g. admin blacklist or vehicle-category assignment) so no row is ever reason-less. */
export const GENERIC_SERVICE_BLOCK: EligibilityReason = {
  code: "NOT_AVAILABLE",
  reason: "This service isn't available in your area right now.",
  requiredAction: "Try again from a covered area, or check your documents if prompted.",
};

/** Document / verification gaps the rider can clear by uploading. */
export function isDocEligibilityCode(code: string): boolean {
  const c = String(code || "").toUpperCase();
  return (
    c.startsWith("DL_") ||
    c.startsWith("RC_") ||
    c.includes("PROOF_") ||
    c.includes("NOT_VERIFIED") ||
    c.includes("_PENDING") ||
    c.includes("_REJECTED") ||
    c.includes("_EXPIRED")
  );
}

/** Vehicle / ownership / commercial policy — not a geo-coverage OFF. */
export function isVehicleEligibilityCode(code: string): boolean {
  const c = String(code || "").toUpperCase();
  return (
    c === "COMMERCIAL_VEHICLE_REQUIRED" ||
    c === "VEHICLE_CLASS_NOT_ALLOWED" ||
    c === "FUEL_NOT_ALLOWED" ||
    c === "OWNERSHIP_NOT_ALLOWED" ||
    c === "NO_VEHICLE" ||
    c.includes("COMMERCIAL") ||
    c.includes("VEHICLE_CLASS") ||
    c.includes("FUEL_") ||
    c.includes("OWNERSHIP")
  );
}

/** Geo / location enablement — service off in this area (Geo & coverage toggle). */
export function isAreaEligibilityCode(code: string): boolean {
  const c = String(code || "").toUpperCase();
  return (
    c === "SERVICE_DISABLED" ||
    c === "NOT_AVAILABLE" ||
    c.includes("AREA") ||
    c.includes("LOCATION") ||
    c.includes("GEO") ||
    c.includes("HIRING")
  );
}

/**
 * UI slogan mode for the eligibility reason sheet (priority = docs → vehicle → area):
 * - docs → upload / pending document messaging
 * - vehicle → commercial / class / fuel (never "not in your area")
 * - area → Geo & coverage service toggle OFF
 */
export function resolveEligibilitySloganMode(
  reasons: EligibilityReason[],
): "docs" | "vehicle" | "area" {
  if (reasons.some((r) => isDocEligibilityCode(r.code))) return "docs";
  if (reasons.some((r) => isVehicleEligibilityCode(r.code))) return "vehicle";
  if (reasons.some((r) => isAreaEligibilityCode(r.code))) return "area";
  return "vehicle";
}

export function areaEligibilityDisplayReason(): EligibilityReason {
  return {
    code: "SERVICE_DISABLED",
    reason: "Oops! This service isn’t available in your area yet.",
    requiredAction: undefined,
  };
}

/** Prefer doc reasons, then vehicle, then geo — matches check order for the sheet list. */
export function prioritizeEligibilityReasons(
  reasons: EligibilityReason[],
): EligibilityReason[] {
  if (!reasons.length) return reasons;
  const docs = reasons.filter((r) => isDocEligibilityCode(r.code));
  const vehicle = reasons.filter((r) => isVehicleEligibilityCode(r.code));
  const area = reasons.filter((r) => isAreaEligibilityCode(r.code));
  const other = reasons.filter(
    (r) =>
      !isDocEligibilityCode(r.code) &&
      !isVehicleEligibilityCode(r.code) &&
      !isAreaEligibilityCode(r.code),
  );
  return dedupeCommercialVehicleReasons([...docs, ...vehicle, ...other, ...area]);
}

/**
 * commercialRequired + ownership allowlist often emit the same block twice.
 * Keep a single clear line for Person Ride / commercial gates.
 */
export function dedupeCommercialVehicleReasons(
  reasons: EligibilityReason[],
): EligibilityReason[] {
  const hasCommercial = reasons.some((r) => r.code === "COMMERCIAL_VEHICLE_REQUIRED");
  const hasOwnership = reasons.some((r) => r.code === "OWNERSHIP_NOT_ALLOWED");
  if (!hasCommercial || !hasOwnership) return reasons;

  const out: EligibilityReason[] = [];
  let commercialEmitted = false;
  for (const r of reasons) {
    if (r.code === "OWNERSHIP_NOT_ALLOWED") continue;
    if (r.code === "COMMERCIAL_VEHICLE_REQUIRED") {
      if (commercialEmitted) continue;
      commercialEmitted = true;
      out.push({
        ...r,
        reason: r.reason.includes("commercial vehicles are required")
          ? r.reason
          : "Person Ride isn’t available — commercial vehicles are required.",
      });
      continue;
    }
    out.push(r);
  }
  return out;
}

export function buildServiceEligibilityRows(args: {
  selectableServices: RiderServiceTypeValue[];
  backend?: BackendEligibilityByService | null;
  order?: RiderServiceTypeValue[];
}): ServiceEligibilityRow[] {
  const order = args.order ?? RIDER_SERVICE_DISPLAY_ORDER;
  const selectable = new Set(args.selectableServices);

  return order.map((service): ServiceEligibilityRow => {
    const decision = args.backend?.[service];
    if (decision && decision.eligible === false) {
      const reasons = prioritizeEligibilityReasons(
        decision.blocking.length > 0 ? decision.blocking : [GENERIC_SERVICE_BLOCK],
      );
      return { service, state: "blocked", reasons };
    }
    if (decision?.eligible === true || selectable.has(service)) {
      return { service, state: "selectable", reasons: [] };
    }
    const reasons = prioritizeEligibilityReasons(
      decision && decision.blocking.length > 0 ? decision.blocking : [GENERIC_SERVICE_BLOCK],
    );
    return { service, state: "blocked", reasons };
  });
}

/** True when at least one service is blocked (so the dropdown should reveal the info affordance). */
export function hasBlockedService(rows: ServiceEligibilityRow[]): boolean {
  return rows.some((r) => r.state === "blocked");
}

/**
 * Services the rider may toggle on for duty.
 *
 * When the eligibility engine returned a complete decision for food/parcel/person_ride,
 * that list is authoritative (engine-eligible wins even if outside the client pool).
 * While the request is loading / incomplete, fall back to the client duty pool so we
 * never lock the rider out of every service.
 */
export function resolveSelectableServices(args: {
  clientPool: RiderServiceTypeValue[];
  backend?: BackendEligibilityByService | null;
  /** Reserved for callers; complete backend always wins when present. */
  enforced?: boolean;
}): RiderServiceTypeValue[] {
  const pool = Array.isArray(args.clientPool) ? args.clientPool : [];
  const backend = args.backend;
  if (!backend) return pool;

  const known = RIDER_SERVICE_DISPLAY_ORDER.filter((service) => backend[service] != null);
  if (known.length === RIDER_SERVICE_DISPLAY_ORDER.length) {
    return RIDER_SERVICE_DISPLAY_ORDER.filter(
      (service) => backend[service]?.eligible === true
    );
  }

  // Partial backend: keep the client pool, but never re-open a service the engine
  // already marked ineligible (e.g. Person Ride blocked while Food/Parcel still loading).
  return pool.filter((service) => backend[service]?.eligible !== false);
}

type OnboardingEligibilitySummary<TBlocked> = {
  onboarding: {
    eligibleServices: string[];
    blockedServices: TBlocked[];
    allEligible: boolean;
  };
};

/**
 * KYC / Documents chips must interpret the same engine result as Home.
 * Overlay live-location eligibility onto the onboarding summary without a second formula.
 */
export function overlayOnboardingSummaryWithEligibility<
  TBlocked extends { service: string; missingDocuments: string[]; reasons: string[] },
  T extends OnboardingEligibilitySummary<TBlocked>,
>(summary: T, backend: BackendEligibilityByService | null): T {
  if (!backend) return summary;
  const known = RIDER_SERVICE_DISPLAY_ORDER.filter((service) => backend[service] != null);
  if (known.length !== RIDER_SERVICE_DISPLAY_ORDER.length) return summary;

  const eligibleServices = RIDER_SERVICE_DISPLAY_ORDER.filter(
    (service) => backend[service]?.eligible === true,
  );
  const blockedServices = RIDER_SERVICE_DISPLAY_ORDER.filter(
    (service) => backend[service]?.eligible === false,
  ).map((service) => {
    const blocking = prioritizeEligibilityReasons(backend[service]?.blocking ?? []);
    return {
      service,
      missingDocuments: Array.from(
        new Set(
          blocking.flatMap((b) => {
            const c = String(b.code || "").toUpperCase();
            const docs: string[] = [];
            if (c.startsWith("DL_")) docs.push("DRIVING_LICENSE");
            if (c.startsWith("RC_")) docs.push("REGISTRATION_CERTIFICATE");
            return docs;
          }),
        ),
      ),
      reasons: blocking.map((b) => b.reason).filter(Boolean),
    };
  }) as TBlocked[];

  return {
    ...summary,
    onboarding: {
      ...summary.onboarding,
      eligibleServices,
      blockedServices,
      allEligible: blockedServices.length === 0,
    },
  };
}
