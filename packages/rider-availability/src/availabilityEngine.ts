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
export const DEFAULT_LOCATION_FRESHNESS_MAX_AGE_MINUTES = 10;

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

type CandidateRow = {
  rider_id: number;
  user_id: string;
  lat: number;
  lng: number;
  location_updated_at: Date | null;
  account_status: string;
  onboarding_stage: string;
  duty_status: string | null;
  duty_service_types: unknown;
  distance_meters: number | string | null;
  current_active_assignments: number | string | null;
  max_active_assignments: number | string | null;
  current_assigned_order_display_id: string | null;
};

function parseServiceTypesJsonb(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

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
export function deriveAvailability(input: AvailabilityInputs): DerivedAvailability {
  const now = input.now ?? new Date();
  const locationAgeSeconds = input.locationUpdatedAt
    ? Math.max(0, Math.round((now.getTime() - input.locationUpdatedAt.getTime()) / 1000))
    : null;
  const locationFresh =
    locationAgeSeconds != null && locationAgeSeconds <= input.freshnessMaxAgeMinutes * 60;

  const onDuty = input.dutyStatus === "ON";
  const serviceEligible = input.dutyServiceTypes.includes(input.service);
  const accountActive = input.accountStatus === "ACTIVE" && input.onboardingStage === "ACTIVE";

  const remainingCapacity = Math.max(0, input.maxActiveAssignments - input.currentActiveAssignments);
  const hasCapacity = remainingCapacity > 0;

  const eligible = accountActive && onDuty && serviceEligible && locationFresh && hasCapacity;

  const reasons: string[] = [];
  if (!accountActive) reasons.push("account_not_active");
  if (!onDuty) reasons.push("off_duty");
  if (!serviceEligible) reasons.push("service_not_selected");
  if (!locationFresh) reasons.push("location_stale");
  if (!hasCapacity) reasons.push("no_capacity");

  return {
    accountActive,
    onDuty,
    serviceEligible,
    locationFresh,
    locationAgeSeconds,
    remainingCapacity,
    hasCapacity,
    eligible,
    reasons,
  };
}

function toCandidate(
  row: CandidateRow,
  service: DispatchServiceType,
  freshnessMaxAgeMinutes: number
): RiderAvailabilityCandidate {
  const locationUpdatedAt = row.location_updated_at ? new Date(row.location_updated_at) : null;
  const dutyServiceTypes = parseServiceTypesJsonb(row.duty_service_types);
  const currentActiveAssignments = Number(row.current_active_assignments ?? 0);
  const maxActiveAssignments = Number(row.max_active_assignments ?? 0);
  const distanceMeters = row.distance_meters == null ? null : Number(row.distance_meters);

  const derived = deriveAvailability({
    accountStatus: row.account_status,
    onboardingStage: row.onboarding_stage,
    dutyStatus: row.duty_status,
    dutyServiceTypes,
    service,
    locationUpdatedAt,
    freshnessMaxAgeMinutes,
    currentActiveAssignments,
    maxActiveAssignments,
  });

  return {
    riderId: Number(row.rider_id),
    userId: String(row.user_id),
    lat: Number(row.lat),
    lng: Number(row.lng),
    distanceMeters,
    locationUpdatedAt,
    locationAgeSeconds: derived.locationAgeSeconds,
    locationFresh: derived.locationFresh,
    dutyStatus: (row.duty_status as RiderAvailabilityCandidate["dutyStatus"]) ?? null,
    dutyServiceTypes,
    onDuty: derived.onDuty,
    serviceEligible: derived.serviceEligible,
    accountActive: derived.accountActive,
    currentActiveAssignments,
    maxActiveAssignments,
    remainingCapacity: derived.remainingCapacity,
    hasCapacity: derived.hasCapacity,
    eligible: derived.eligible,
    currentAssignedOrderDisplayId: row.current_assigned_order_display_id,
  };
}

/** Bounding-box pad in degrees for a given radius (~111.32km per degree lat). */
function boundingBoxDegrees(lat: number, radiusMeters: number): { latDelta: number; lngDelta: number } {
  const latDelta = radiusMeters / 111_320;
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const lngDelta = radiusMeters / (111_320 * cosLat);
  return { latDelta, lngDelta };
}

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
export async function queryRiderAvailabilityCandidates(
  sql: Sql,
  args: QueryCandidatesArgs
): Promise<RiderAvailabilityCandidate[]> {
  const { service, lat, lng, radiusMeters } = args;
  const freshnessMaxAgeMinutes = args.freshnessMaxAgeMinutes ?? DEFAULT_LOCATION_FRESHNESS_MAX_AGE_MINUTES;
  const limit = args.limit ?? 500;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    return [];
  }

  const { latDelta, lngDelta } = boundingBoxDegrees(lat, radiusMeters);
  const serviceJson = JSON.stringify([service]);

  const rows = (await sql`
    WITH candidates AS (
      SELECT
        r.id AS rider_id,
        rcl.user_id AS user_id,
        rcl.lat AS lat,
        rcl.lng AS lng,
        rcl.updated_at AS location_updated_at,
        r.status AS account_status,
        r.onboarding_stage AS onboarding_stage,
        ld.status::text AS duty_status,
        COALESCE(ld.service_types, '[]'::jsonb) AS duty_service_types
      FROM rider_current_locations rcl
      INNER JOIN riders r ON r.id = rcl.rider_id
      INNER JOIN LATERAL (
        SELECT dl.status, dl.service_types
        FROM duty_logs dl
        WHERE dl.rider_id = rcl.rider_id
        ORDER BY dl.timestamp DESC
        LIMIT 1
      ) ld ON true
      WHERE r.deleted_at IS NULL
        AND rcl.lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
        AND rcl.lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
    ),
    scored AS (
      SELECT
        c.*,
        (
          6371008.8 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(c.lat - ${lat}) / 2), 2) +
            COS(RADIANS(${lat})) * COS(RADIANS(c.lat)) *
            POWER(SIN(RADIANS(c.lng - ${lng}) / 2), 2)
          ))
        ) AS distance_meters
      FROM candidates c
    )
    SELECT
      s.rider_id,
      s.user_id,
      s.lat,
      s.lng,
      s.location_updated_at,
      s.account_status,
      s.onboarding_stage,
      s.duty_status,
      s.duty_service_types,
      s.distance_meters,
      COALESCE(active.same_service_count, 0)::int AS current_active_assignments,
      COALESCE(limits.max_active_assignments, 0)::int AS max_active_assignments,
      active.display_order_id AS current_assigned_order_display_id
    FROM scored s
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS same_service_count,
        (ARRAY_AGG(
          COALESCE(NULLIF(TRIM(oc.order_id), ''), oc.id::text)
          ORDER BY oc.placed_at DESC NULLS LAST, oc.id DESC
        ))[1] AS display_order_id
      FROM orders_core oc
      LEFT JOIN orders_food ofd ON ofd.order_id = oc.id AND oc.order_type = 'food'
      LEFT JOIN orders_ride ori ON ori.order_id = oc.id AND oc.order_type = 'person_ride'
      WHERE oc.rider_id = s.rider_id
        AND oc.order_type = ${service}
        AND oc.status::text NOT IN ('delivered', 'cancelled', 'failed')
        AND (oc.order_type <> 'food' OR ofd.order_status IS NULL OR ofd.order_status NOT IN ('DELIVERED', 'CANCELLED', 'RTO'))
        AND (oc.order_type <> 'person_ride' OR ori.cancelled_at IS NULL)
    ) active ON true
    LEFT JOIN LATERAL (
      SELECT max_active_assignments
      FROM platform_service_assignment_limits
      WHERE service_type = ${service} AND is_active = true
      LIMIT 1
    ) limits ON true
    WHERE s.distance_meters <= ${radiusMeters}
      AND COALESCE(s.duty_service_types, '[]'::jsonb) @> ${serviceJson}::text::jsonb
    ORDER BY s.distance_meters ASC
    LIMIT ${limit}
  `) as unknown as CandidateRow[];

  return rows.map((row) => toCandidate(row, service, freshnessMaxAgeMinutes));
}

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
export async function evaluateSingleRiderAvailability(
  sql: Sql,
  args: EvaluateSingleRiderArgs
): Promise<SingleRiderAvailability> {
  const { riderId, service } = args;
  const freshnessMaxAgeMinutes = args.freshnessMaxAgeMinutes ?? DEFAULT_LOCATION_FRESHNESS_MAX_AGE_MINUTES;

  const rows = (await sql`
    WITH candidate AS (
      SELECT
        r.id AS rider_id,
        COALESCE(rcl.user_id, '') AS user_id,
        rcl.lat AS lat,
        rcl.lng AS lng,
        rcl.updated_at AS location_updated_at,
        r.status AS account_status,
        r.onboarding_stage AS onboarding_stage,
        ld.status::text AS duty_status,
        COALESCE(ld.service_types, '[]'::jsonb) AS duty_service_types
      FROM riders r
      LEFT JOIN rider_current_locations rcl ON rcl.rider_id = r.id
      LEFT JOIN LATERAL (
        SELECT dl.status, dl.service_types
        FROM duty_logs dl
        WHERE dl.rider_id = r.id
        ORDER BY dl.timestamp DESC
        LIMIT 1
      ) ld ON true
      WHERE r.id = ${riderId}
      LIMIT 1
    )
    SELECT
      c.rider_id,
      c.user_id,
      c.lat,
      c.lng,
      c.location_updated_at,
      c.account_status,
      c.onboarding_stage,
      c.duty_status,
      c.duty_service_types,
      NULL::float8 AS distance_meters,
      COALESCE(active.same_service_count, 0)::int AS current_active_assignments,
      COALESCE(limits.max_active_assignments, 0)::int AS max_active_assignments,
      active.display_order_id AS current_assigned_order_display_id
    FROM candidate c
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS same_service_count,
        (ARRAY_AGG(
          COALESCE(NULLIF(TRIM(oc.order_id), ''), oc.id::text)
          ORDER BY oc.placed_at DESC NULLS LAST, oc.id DESC
        ))[1] AS display_order_id
      FROM orders_core oc
      LEFT JOIN orders_food ofd ON ofd.order_id = oc.id AND oc.order_type = 'food'
      LEFT JOIN orders_ride ori ON ori.order_id = oc.id AND oc.order_type = 'person_ride'
      WHERE oc.rider_id = c.rider_id
        AND oc.order_type = ${service}
        AND oc.status::text NOT IN ('delivered', 'cancelled', 'failed')
        AND (oc.order_type <> 'food' OR ofd.order_status IS NULL OR ofd.order_status NOT IN ('DELIVERED', 'CANCELLED', 'RTO'))
        AND (oc.order_type <> 'person_ride' OR ori.cancelled_at IS NULL)
    ) active ON true
    LEFT JOIN LATERAL (
      SELECT max_active_assignments
      FROM platform_service_assignment_limits
      WHERE service_type = ${service} AND is_active = true
      LIMIT 1
    ) limits ON true
  `) as unknown as CandidateRow[];

  const row = rows[0];
  if (!row || row.lat == null || row.lng == null) {
    return {
      candidate: null,
      eligible: false,
      reasons: ["no_location_on_record"],
    };
  }

  const candidate = toCandidate(row, service, freshnessMaxAgeMinutes);
  const derived = deriveAvailability({
    accountStatus: row.account_status,
    onboardingStage: row.onboarding_stage,
    dutyStatus: row.duty_status,
    dutyServiceTypes: candidate.dutyServiceTypes,
    service,
    locationUpdatedAt: candidate.locationUpdatedAt,
    freshnessMaxAgeMinutes,
    currentActiveAssignments: candidate.currentActiveAssignments,
    maxActiveAssignments: candidate.maxActiveAssignments,
  });

  return { candidate, eligible: derived.eligible, reasons: derived.reasons };
}
