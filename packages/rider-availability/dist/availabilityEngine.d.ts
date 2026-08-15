/**
 * Rider Availability Engine — single source of truth for "is this rider
 * dispatchable right now for this service, near this point".
 *
 * Consumed by both the backend (customer-facing serviceability check,
 * `dispatch-serviceability.ts`) and the dashboard (Super Admin Geo Rx
 * diagnostic view) via their own `postgres` `Sql` client — this package owns
 * no DB connection of its own (backend and dashboard are separate
 * deployables with separate direct Postgres connections; see
 * `@gatimitra/slab-pricing` for the same shared-package pattern already
 * used for pricing math).
 *
 * Root cause this closes: three call sites each re-implemented "is this
 * rider available" with subtly different rules (some checked location
 * freshness, some didn't; none checked remaining multi-order capacity) —
 * a rider could show ONLINE on one surface and unavailable on another for
 * the exact same instant. This module is the ONE place the geo + duty +
 * freshness + capacity predicate lives; callers should not re-derive it.
 *
 * Capacity numbers here mirror `backend/src/lib/rider-assignment-control.ts`
 * (`countRiderActiveAssignments` + `platform_service_assignment_limits`) at
 * the raw-SQL level, since that module itself is backend-only (drizzle) and
 * cannot be imported by the dashboard. The full cross-service exclusivity
 * business rules (person_ride exclusivity, cross-service toggle) stay
 * authoritative in `rider-assignment-control.ts` for the actual
 * offer/accept decision — `hasCapacity` here is a same-service headroom
 * check only, sufficient for "roughly how many riders could take this" and
 * for the diagnostic candidate list, not a binding accept-time decision.
 */
import type { Sql } from "postgres";
export type DispatchServiceType = "food" | "parcel" | "person_ride";
/** Matches `RIDER_DISPATCH_LOCATION_MAX_AGE_MINUTES` in order-assignment-engine.ts. */
export declare const DEFAULT_LOCATION_FRESHNESS_MAX_AGE_MINUTES = 10;
export type RiderAvailabilityCandidate = {
    riderId: number;
    userId: string;
    lat: number;
    lng: number;
    distanceMeters: number | null;
    locationUpdatedAt: Date | null;
    locationAgeSeconds: number | null;
    locationFresh: boolean;
    dutyStatus: "ON" | "OFF" | "AUTO_OFF" | null;
    dutyServiceTypes: string[];
    onDuty: boolean;
    serviceEligible: boolean;
    accountActive: boolean;
    currentActiveAssignments: number;
    maxActiveAssignments: number;
    remainingCapacity: number;
    hasCapacity: boolean;
    /** accountActive && onDuty && serviceEligible && locationFresh && hasCapacity */
    eligible: boolean;
    /** Non-terminal order this rider is currently assigned to (for "busy" display), if any. */
    currentAssignedOrderDisplayId: string | null;
};
export type AvailabilityInputs = {
    accountStatus: string | null;
    onboardingStage: string | null;
    dutyStatus: string | null;
    dutyServiceTypes: string[];
    service: DispatchServiceType;
    locationUpdatedAt: Date | null;
    freshnessMaxAgeMinutes: number;
    currentActiveAssignments: number;
    maxActiveAssignments: number;
    now?: Date;
};
export type DerivedAvailability = {
    accountActive: boolean;
    onDuty: boolean;
    serviceEligible: boolean;
    locationFresh: boolean;
    locationAgeSeconds: number | null;
    remainingCapacity: number;
    hasCapacity: boolean;
    eligible: boolean;
    reasons: string[];
};
/**
 * Pure eligibility composition — no DB access, unit-testable in isolation.
 * `eligible` is the single binding gate every caller should use; the individual
 * booleans + `reasons` exist for the diagnostic breakdown (master prompt Part 35).
 */
export declare function deriveAvailability(input: AvailabilityInputs): DerivedAvailability;
export type QueryCandidatesArgs = {
    service: DispatchServiceType;
    lat: number;
    lng: number;
    radiusMeters: number;
    /** Default RIDER_DISPATCH_LOCATION_MAX_AGE_MINUTES (10). */
    freshnessMaxAgeMinutes?: number;
    limit?: number;
};
/**
 * Candidate riders for `service` within `radiusMeters` of (lat, lng), each with the
 * full geo/duty/freshness/capacity breakdown needed to explain eligibility — not just
 * a count. Callers filter on `.eligible` for a binding availability decision, or keep
 * the full list for a diagnostic "why is/isn't this rider counted" view.
 */
export declare function queryRiderAvailabilityCandidates(sql: Sql, args: QueryCandidatesArgs): Promise<RiderAvailabilityCandidate[]>;
export type EvaluateSingleRiderArgs = {
    riderId: number;
    service: DispatchServiceType;
    freshnessMaxAgeMinutes?: number;
};
export type SingleRiderAvailability = {
    candidate: RiderAvailabilityCandidate | null;
    eligible: boolean;
    /** Which check(s) failed, e.g. "location_stale", "off_duty", "no_capacity". Empty when eligible. */
    reasons: string[];
};
/**
 * Same predicate as `queryRiderAvailabilityCandidates`, for exactly one rider, with no
 * distance/radius gate — for the Super Admin per-rider diagnostic view (master prompt
 * Part 35: "show WHY a rider is or isn't counted", proven with real values, not a guess).
 */
export declare function evaluateSingleRiderAvailability(sql: Sql, args: EvaluateSingleRiderArgs): Promise<SingleRiderAvailability>;
//# sourceMappingURL=availabilityEngine.d.ts.map