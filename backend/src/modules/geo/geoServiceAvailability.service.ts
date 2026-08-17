import { getSql } from "../../db/client.js";
import { resolveGeoLocation } from "../billing/geoLocationResolver.js";
import type { DropGeoRefByLevel } from "../billing/types.js";
import {
  pickMostSpecificGeoAnchor,
} from "../ride-state-config/rideStateConfig.repository.js";
import type { GeoHierarchyLevel } from "../rider-payout-pricing/types.js";

export type GeoServiceAvailability = {
  found: boolean;
  food: boolean;
  parcel: boolean;
  ride: boolean;
  /**
   * Coverage flags BEFORE Prevent Services is applied. Riders must use these
   * for duty eligibility so a blocked area never turns a rider offline —
   * only order pickup/drop points are filtered at dispatch.
   */
  coverageFood: boolean;
  coverageParcel: boolean;
  coverageRide: boolean;
  pincode: string | null;
  stateName: string | null;
  /** `states.id` from the resolved geo chain — used by rider-online-check and similar flags. */
  stateId: string | null;
  resolvedLevel: string | null;
  /**
   * Service codes disabled by an active Prevent Services rule at this point —
   * distinct from "outside coverage", so clients can show the emergency
   * "Service Temporarily Unavailable" copy only when it actually applies.
   */
  preventBlocked: string[];
  /** Admin-configured reason from the nearest matching Prevent Services rule. */
  preventReason: string | null;
  preventLocationName: string | null;
  preventRuleId: string | null;
  preventStartsAt: string | null;
  preventEndsAt: string | null;
};

type ServiceFlagRow = {
  is_food_enabled: boolean;
  is_parcel_enabled: boolean;
  is_ride_enabled: boolean;
};

type GeoResolvePincodePayload = {
  found?: boolean;
  available?: boolean;
  error?: string;
};

async function loadServiceFlags(
  level: GeoHierarchyLevel,
  refId: string
): Promise<ServiceFlagRow | null> {
  const sql = getSql();
  if (level === "state") {
    const [row] = await sql<ServiceFlagRow[]>`
      SELECT is_food_enabled, is_parcel_enabled, is_ride_enabled
      FROM states WHERE id = ${refId}::uuid LIMIT 1`;
    return row ?? null;
  }
  if (level === "region") {
    const [row] = await sql<ServiceFlagRow[]>`
      SELECT is_food_enabled, is_parcel_enabled, is_ride_enabled
      FROM regions WHERE id = ${refId}::uuid LIMIT 1`;
    return row ?? null;
  }
  if (level === "district") {
    const [row] = await sql<ServiceFlagRow[]>`
      SELECT is_food_enabled, is_parcel_enabled, is_ride_enabled
      FROM districts WHERE id = ${refId}::uuid LIMIT 1`;
    return row ?? null;
  }
  if (level === "division") {
    const [row] = await sql<ServiceFlagRow[]>`
      SELECT is_food_enabled, is_parcel_enabled, is_ride_enabled
      FROM divisions WHERE id = ${refId}::uuid LIMIT 1`;
    return row ?? null;
  }
  if (level === "post_office") {
    const [row] = await sql<ServiceFlagRow[]>`
      SELECT is_food_enabled, is_parcel_enabled, is_ride_enabled
      FROM post_offices WHERE id = ${refId}::uuid LIMIT 1`;
    return row ?? null;
  }
  const [row] = await sql<ServiceFlagRow[]>`
    SELECT is_food_enabled, is_parcel_enabled, is_ride_enabled
    FROM pincodes WHERE id = ${refId}::uuid LIMIT 1`;
  return row ?? null;
}

async function resolveFromPincodeRpc(args: {
  pincode: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<GeoServiceAvailability | null> {
  const sql = getSql();
  const services = ["food", "parcel", "ride"] as const;
  const results = await Promise.all(
    services.map(async (service) => {
      const [row] = await sql<[{ geo_resolve_pincode: GeoResolvePincodePayload }]>`
        SELECT geo_resolve_pincode(
          ${args.pincode.trim()},
          ${service},
          ${args.lat ?? null},
          ${args.lng ?? null}
        ) AS geo_resolve_pincode
      `;
      return row?.geo_resolve_pincode ?? { found: false };
    })
  );

  if (!results.some((r) => r.found === true)) return null;

  return {
    found: true,
    food: results[0]?.available === true,
    parcel: results[1]?.available === true,
    ride: results[2]?.available === true,
    coverageFood: results[0]?.available === true,
    coverageParcel: results[1]?.available === true,
    coverageRide: results[2]?.available === true,
    pincode: args.pincode.trim(),
    stateName: null,
    stateId: null,
    resolvedLevel: "pincode",
    preventBlocked: [],
    preventReason: null,
    preventLocationName: null,
    preventRuleId: null,
    preventStartsAt: null,
    preventEndsAt: null,
  };
}

async function resolveFromGeoRefs(
  refs: DropGeoRefByLevel,
  pincode: string | null,
  stateName: string | null
): Promise<GeoServiceAvailability | null> {
  const anchor = pickMostSpecificGeoAnchor(refs);
  if (!anchor) return null;
  const flags = await loadServiceFlags(anchor.level, anchor.refId);
  if (!flags) return null;
  return {
    found: true,
    food: flags.is_food_enabled,
    parcel: flags.is_parcel_enabled,
    ride: flags.is_ride_enabled,
    coverageFood: flags.is_food_enabled,
    coverageParcel: flags.is_parcel_enabled,
    coverageRide: flags.is_ride_enabled,
    pincode,
    stateName,
    stateId: refs.state ?? null,
    resolvedLevel: anchor.level,
    preventBlocked: [],
    preventReason: null,
    preventLocationName: null,
    preventRuleId: null,
    preventStartsAt: null,
    preventEndsAt: null,
  };
}

async function resolveFromStateName(stateName: string): Promise<GeoServiceAvailability | null> {
  const sql = getSql();
  const [row] = await sql<(ServiceFlagRow & { id: string })[]>`
    SELECT id::text AS id, is_food_enabled, is_parcel_enabled, is_ride_enabled
    FROM states
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(${stateName}))
    LIMIT 1
  `;
  if (!row) return null;
  return {
    found: true,
    food: row.is_food_enabled,
    parcel: row.is_parcel_enabled,
    ride: row.is_ride_enabled,
    coverageFood: row.is_food_enabled,
    coverageParcel: row.is_parcel_enabled,
    coverageRide: row.is_ride_enabled,
    pincode: null,
    stateName: stateName.trim(),
    stateId: row.id,
    resolvedLevel: "state",
    preventBlocked: [],
    preventReason: null,
    preventLocationName: null,
    preventRuleId: null,
    preventStartsAt: null,
    preventEndsAt: null,
  };
}

export async function resolveGeoServiceAvailability(args: {
  pincode?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<GeoServiceAvailability> {
  const geo = await resolveGeoLocation({
    livePincode: args.pincode,
    liveState: args.state,
    latitude: args.lat,
    longitude: args.lng,
  });

  const pincode = geo.pincode;
  const stateName = geo.stateName;
  const lat = args.lat ?? null;
  const lng = args.lng ?? null;

  let base: GeoServiceAvailability | null = null;

  if (pincode) {
    const fromPincode = await resolveFromPincodeRpc({ pincode, lat, lng });
    if (fromPincode) base = fromPincode;
  }

  if (!base && geo.refs) {
    const fromRefs = await resolveFromGeoRefs(geo.refs, pincode, stateName);
    if (fromRefs) base = fromRefs;
  }

  if (!base && stateName) {
    const fromState = await resolveFromStateName(stateName);
    if (fromState) base = fromState;
  }

  if (!base) {
    base = {
      found: false,
      food: false,
      parcel: false,
      ride: false,
      coverageFood: false,
      coverageParcel: false,
      coverageRide: false,
      pincode,
      stateName,
      stateId: null,
      resolvedLevel: null,
      preventBlocked: [],
      preventReason: null,
      preventLocationName: null,
      preventRuleId: null,
      preventStartsAt: null,
      preventEndsAt: null,
    };
  }

  // Snapshot coverage BEFORE prevent — riders use these for duty eligibility so a
  // blocked area never turns them offline wholesale.
  const coverageFood = base.food;
  const coverageParcel = base.parcel;
  const coverageRide = base.ride;

  // Emergency Prevent Services radius blocks (nearest overlapping rule wins messaging;
  // any matching block disables the service for the customer pin only).
  try {
    const { applyPreventServicesToGeoFlags } = await import(
      "../prevent-services/preventServices.engine.js"
    );
    const merged = await applyPreventServicesToGeoFlags({
      food: base.food,
      parcel: base.parcel,
      ride: base.ride,
      lat,
      lng,
    });
    return {
      ...base,
      stateId: geo.refs?.state ?? base.stateId ?? null,
      stateName: base.stateName ?? geo.stateName,
      coverageFood,
      coverageParcel,
      coverageRide,
      food: merged.food,
      parcel: merged.parcel,
      ride: merged.ride,
      preventBlocked: merged.preventBlocked,
      preventReason: merged.preventReason,
      preventLocationName: merged.preventLocationName,
      preventRuleId: merged.preventRuleId,
      preventStartsAt: merged.preventStartsAt,
      preventEndsAt: merged.preventEndsAt,
    };
  } catch {
    return {
      ...base,
      stateId: geo.refs?.state ?? base.stateId ?? null,
      stateName: base.stateName ?? geo.stateName,
      coverageFood,
      coverageParcel,
      coverageRide,
      preventReason: null,
      preventLocationName: null,
      preventRuleId: null,
      preventStartsAt: null,
      preventEndsAt: null,
    };
  }
}
