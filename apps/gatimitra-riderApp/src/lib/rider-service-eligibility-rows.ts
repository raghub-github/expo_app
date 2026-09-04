/**
 * Pure resolver for the rider service dropdown rows — the "preference ≠ eligibility"
 * surface. Given what the rider can currently SELECT (the existing client pool, which also
 * governs duty behaviour) and the BACKEND engine's per-service decision, it produces the
 * row list the dropdown renders: selectable services get a checkbox; the rest are shown
 * BLOCKED with the backend's reasons + required actions instead of being silently hidden.
 *
 * Design rules (kept deterministic + unit-tested so device testing only covers visuals):
 *  - Selectability is authoritative for UI interactivity and stays driven by the existing
 *    client pool, so this surface never blocks a service the rider can still go on duty for
 *    while enforcement is in shadow mode (no behaviour regression).
 *  - The backend engine is authoritative for the REASONS a blocked service shows.
 *  - If a service is blocked but the backend has no specific reason (engine says eligible,
 *    or no data yet), a single generic reason is shown — never an empty "blocked" row.
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
  reason: "This service isn't available for your vehicle or area right now.",
  requiredAction: "Check your vehicle and documents, or try again from a covered area.",
};

export function buildServiceEligibilityRows(args: {
  selectableServices: RiderServiceTypeValue[];
  backend?: BackendEligibilityByService | null;
  order?: RiderServiceTypeValue[];
}): ServiceEligibilityRow[] {
  const order = args.order ?? RIDER_SERVICE_DISPLAY_ORDER;
  const selectable = new Set(args.selectableServices);

  return order.map((service): ServiceEligibilityRow => {
    if (selectable.has(service)) {
      return { service, state: "selectable", reasons: [] };
    }
    const decision = args.backend?.[service];
    const reasons =
      decision && !decision.eligible && decision.blocking.length > 0
        ? decision.blocking
        : [GENERIC_SERVICE_BLOCK];
    return { service, state: "blocked", reasons };
  });
}

/** True when at least one service is blocked (so the dropdown should reveal the info affordance). */
export function hasBlockedService(rows: ServiceEligibilityRow[]): boolean {
  return rows.some((r) => r.state === "blocked");
}

/**
 * Which services the rider may actually turn ON (go online for). Starts from the existing
 * client pool (duty/vehicle/coverage) and, ONLY when eligibility enforcement is active,
 * removes services the backend engine says are ineligible (documents + location). This is
 * what makes "only allowed services can go online" real — but it is FAIL-OPEN: when
 * enforcement is off, or the backend decision is unavailable/missing for a service, that
 * service is NOT restricted, so a network blip or a shadow rollout can never lock a rider
 * offline. A service is removed only on an explicit `eligible === false` from the engine.
 */
export function resolveSelectableServices(args: {
  clientPool: RiderServiceTypeValue[];
  backend?: BackendEligibilityByService | null;
  enforced: boolean;
}): RiderServiceTypeValue[] {
  if (!args.enforced || !args.backend) return args.clientPool;
  const backend = args.backend;
  return args.clientPool.filter((service) => backend[service]?.eligible !== false);
}
