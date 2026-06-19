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
  pincode: string | null;
  stateName: string | null;
  resolvedLevel: string | null;
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
    pincode: args.pincode.trim(),
    stateName: null,
    resolvedLevel: "pincode",
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
    pincode,
    stateName,
    resolvedLevel: anchor.level,
  };
}

async function resolveFromStateName(stateName: string): Promise<GeoServiceAvailability | null> {
  const sql = getSql();
  const [row] = await sql<ServiceFlagRow[]>`
    SELECT is_food_enabled, is_parcel_enabled, is_ride_enabled
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
    pincode: null,
    stateName: stateName.trim(),
    resolvedLevel: "state",
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

  if (pincode) {
    const fromPincode = await resolveFromPincodeRpc({ pincode, lat, lng });
    if (fromPincode) return fromPincode;
  }

  if (geo.refs) {
    const fromRefs = await resolveFromGeoRefs(geo.refs, pincode, stateName);
    if (fromRefs) return fromRefs;
  }

  if (stateName) {
    const fromState = await resolveFromStateName(stateName);
    if (fromState) return fromState;
  }

  return {
    found: false,
    food: false,
    parcel: false,
    ride: false,
    pincode,
    stateName,
    resolvedLevel: null,
  };
}
