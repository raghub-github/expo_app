/**
 * Onboarding work-location helpers: list geo hierarchy children and resolve
 * GPS/hints against states → regions → districts (reuse geoLocationResolver).
 */
import { getSql } from "../db/client.js";
import { resolveGeoLocation } from "../modules/billing/geoLocationResolver.js";
import { resolveHiringFromChain } from "./rider-geo-hiring.js";

export type GeoHierarchyNode = {
  id: string;
  name: string;
  foodEnabled?: boolean;
  parcelEnabled?: boolean;
  rideEnabled?: boolean;
  /** Effective hiring at this node (states list). Default true when unset. */
  hiringAllowed?: boolean;
};

export type ResolvedWorkLocation = {
  state: { id: string | null; name: string | null };
  region: { id: string | null; name: string | null };
  district: { id: string | null; name: string | null };
  pincode: string | null;
  city: string | null;
  covered: boolean;
  unmatched: boolean;
  refs: {
    stateId: string | null;
    regionId: string | null;
    districtId: string | null;
  };
};

async function loadNames(ids: {
  stateId?: string | null;
  regionId?: string | null;
  districtId?: string | null;
}): Promise<{ state: string | null; region: string | null; district: string | null }> {
  const sql = getSql();
  let state: string | null = null;
  let region: string | null = null;
  let district: string | null = null;
  if (ids.stateId) {
    const [row] = await sql<{ name: string }[]>`
      SELECT name FROM states WHERE id = ${ids.stateId}::uuid LIMIT 1`;
    state = row?.name ?? null;
  }
  if (ids.regionId) {
    const [row] = await sql<{ name: string }[]>`
      SELECT name FROM regions WHERE id = ${ids.regionId}::uuid LIMIT 1`;
    region = row?.name ?? null;
  }
  if (ids.districtId) {
    const [row] = await sql<{ name: string }[]>`
      SELECT name FROM districts WHERE id = ${ids.districtId}::uuid LIMIT 1`;
    district = row?.name ?? null;
  }
  return { state, region, district };
}

async function matchStateByName(name: string | null | undefined): Promise<{ id: string; name: string } | null> {
  const v = String(name || "").trim();
  if (!v || /^(unknown|n\/a|none|-)$/i.test(v)) return null;
  const sql = getSql();
  const [exact] = await sql<{ id: string; name: string }[]>`
    SELECT id::text AS id, name FROM states
    WHERE LOWER(TRIM(name)) = LOWER(${v})
    LIMIT 1`;
  if (exact) return exact;
  const [fuzzy] = await sql<{ id: string; name: string }[]>`
    SELECT id::text AS id, name FROM states
    WHERE LOWER(name) LIKE ${"%" + v.toLowerCase() + "%"}
    ORDER BY LENGTH(name) ASC
    LIMIT 1`;
  return fuzzy ?? null;
}

async function matchDistrictUnderState(
  stateId: string,
  districtHint: string | null | undefined,
  cityHint: string | null | undefined,
): Promise<{ id: string; name: string; regionId: string | null } | null> {
  const hint = String(districtHint || cityHint || "").trim();
  if (!hint || /^(unknown|n\/a|none|-)$/i.test(hint)) return null;
  const sql = getSql();
  const [exact] = await sql<{ id: string; name: string; region_id: string | null }[]>`
    SELECT d.id::text AS id, d.name, d.region_id::text AS region_id
    FROM districts d
    JOIN regions r ON r.id = d.region_id
    WHERE r.state_id = ${stateId}::uuid
      AND LOWER(TRIM(d.name)) = LOWER(${hint})
    LIMIT 1`;
  if (exact) {
    return { id: exact.id, name: exact.name, regionId: exact.region_id };
  }
  const [fuzzy] = await sql<{ id: string; name: string; region_id: string | null }[]>`
    SELECT d.id::text AS id, d.name, d.region_id::text AS region_id
    FROM districts d
    JOIN regions r ON r.id = d.region_id
    WHERE r.state_id = ${stateId}::uuid
      AND LOWER(d.name) LIKE ${"%" + hint.toLowerCase() + "%"}
    ORDER BY LENGTH(d.name) ASC
    LIMIT 1`;
  if (!fuzzy) return null;
  return { id: fuzzy.id, name: fuzzy.name, regionId: fuzzy.region_id };
}

export async function listOnboardingStates(): Promise<GeoHierarchyNode[]> {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      name: string;
      is_food_enabled: boolean;
      is_parcel_enabled: boolean;
      is_ride_enabled: boolean;
    }[]
  >`
    SELECT id::text AS id, name,
           COALESCE(is_food_enabled, true) AS is_food_enabled,
           COALESCE(is_parcel_enabled, true) AS is_parcel_enabled,
           COALESCE(is_ride_enabled, true) AS is_ride_enabled
    FROM states
    ORDER BY name ASC
    LIMIT 200
  `;

  // State-level hiring flags (missing row = inherit/default ON).
  let hiringByState = new Map<string, boolean>();
  try {
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      const flags = await sql<{ geo_ref_id: string; hiring_enabled: boolean }[]>`
        SELECT geo_ref_id::text AS geo_ref_id, hiring_enabled
        FROM rider_geo_hiring
        WHERE geo_level = 'state'::geo_pricing_level
          AND geo_ref_id IN ${sql(ids)}
          AND is_active = TRUE AND deleted_at IS NULL
      `;
      hiringByState = new Map(
        flags.map((f) => [String(f.geo_ref_id).toLowerCase(), f.hiring_enabled !== false]),
      );
    }
  } catch {
    hiringByState = new Map();
  }

  return rows.map((r) => {
    const key = String(r.id).toLowerCase();
    const hiringAllowed = hiringByState.has(key) ? hiringByState.get(key)! : true;
    return {
      id: r.id,
      name: r.name,
      foodEnabled: r.is_food_enabled,
      parcelEnabled: r.is_parcel_enabled,
      rideEnabled: r.is_ride_enabled,
      hiringAllowed,
    };
  });
}

export async function listOnboardingRegions(stateId: string): Promise<GeoHierarchyNode[]> {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      name: string;
      is_food_enabled: boolean;
      is_parcel_enabled: boolean;
      is_ride_enabled: boolean;
    }[]
  >`
    SELECT id::text AS id, name,
           COALESCE(is_food_enabled, true) AS is_food_enabled,
           COALESCE(is_parcel_enabled, true) AS is_parcel_enabled,
           COALESCE(is_ride_enabled, true) AS is_ride_enabled
    FROM regions
    WHERE state_id = ${stateId}::uuid
    ORDER BY name ASC
    LIMIT 500
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    foodEnabled: r.is_food_enabled,
    parcelEnabled: r.is_parcel_enabled,
    rideEnabled: r.is_ride_enabled,
  }));
}

export async function listOnboardingDistricts(regionId: string): Promise<GeoHierarchyNode[]> {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      name: string;
      is_food_enabled: boolean;
      is_parcel_enabled: boolean;
      is_ride_enabled: boolean;
    }[]
  >`
    SELECT id::text AS id, name,
           COALESCE(is_food_enabled, true) AS is_food_enabled,
           COALESCE(is_parcel_enabled, true) AS is_parcel_enabled,
           COALESCE(is_ride_enabled, true) AS is_ride_enabled
    FROM districts
    WHERE region_id = ${regionId}::uuid
    ORDER BY name ASC
    LIMIT 500
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    foodEnabled: r.is_food_enabled,
    parcelEnabled: r.is_parcel_enabled,
    rideEnabled: r.is_ride_enabled,
  }));
}

/** Districts under a state (all regions). Includes parent region for auto-fill. */
export async function listOnboardingDistrictsByState(stateId: string): Promise<
  Array<GeoHierarchyNode & { regionId: string | null; regionName: string | null }>
> {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      name: string;
      region_id: string | null;
      region_name: string | null;
      is_food_enabled: boolean;
      is_parcel_enabled: boolean;
      is_ride_enabled: boolean;
    }[]
  >`
    SELECT d.id::text AS id, d.name,
           d.region_id::text AS region_id,
           r.name AS region_name,
           COALESCE(d.is_food_enabled, true) AS is_food_enabled,
           COALESCE(d.is_parcel_enabled, true) AS is_parcel_enabled,
           COALESCE(d.is_ride_enabled, true) AS is_ride_enabled
    FROM districts d
    JOIN regions r ON r.id = d.region_id
    WHERE r.state_id = ${stateId}::uuid
    ORDER BY d.name ASC
    LIMIT 2000
  `;

  const hiringByKey = new Map<string, boolean>();
  try {
    const regionIds = [
      ...new Set(rows.map((r) => r.region_id).filter((id): id is string => Boolean(id))),
    ];
    const districtIds = rows.map((r) => r.id);
    const load = async (level: "state" | "region" | "district", ids: string[]) => {
      if (ids.length === 0) return;
      const flags = await sql<{ geo_ref_id: string; hiring_enabled: boolean }[]>`
        SELECT geo_ref_id::text AS geo_ref_id, hiring_enabled
        FROM rider_geo_hiring
        WHERE geo_level = ${level}::geo_pricing_level
          AND geo_ref_id IN ${sql(ids)}
          AND is_active = TRUE AND deleted_at IS NULL
      `;
      for (const f of flags) {
        hiringByKey.set(
          `${level}:${String(f.geo_ref_id).toLowerCase()}`,
          f.hiring_enabled !== false,
        );
      }
    };
    await Promise.all([
      load("state", [stateId]),
      load("region", regionIds),
      load("district", districtIds),
    ]);
  } catch {
    /* table missing → default ON */
  }

  const flag = (level: string, id: string | null | undefined): boolean | null => {
    if (!id) return null;
    const key = `${level}:${String(id).toLowerCase()}`;
    return hiringByKey.has(key) ? hiringByKey.get(key)! : null;
  };

  return rows.map((r) => {
    const resolved = resolveHiringFromChain([
      { level: "district", hiringEnabled: flag("district", r.id) },
      { level: "region", hiringEnabled: flag("region", r.region_id) },
      { level: "state", hiringEnabled: flag("state", stateId) },
    ]);
    return {
      id: r.id,
      name: r.name,
      regionId: r.region_id,
      regionName: r.region_name,
      foodEnabled: r.is_food_enabled,
      parcelEnabled: r.is_parcel_enabled,
      rideEnabled: r.is_ride_enabled,
      hiringAllowed: resolved.hiringAllowed,
    };
  });
}

/** Resolve region for a district (used after State+District selection). */
export async function getRegionForDistrict(districtId: string): Promise<{
  regionId: string | null;
  regionName: string | null;
} | null> {
  const sql = getSql();
  const [row] = await sql<{ region_id: string | null; region_name: string | null }[]>`
    SELECT d.region_id::text AS region_id, r.name AS region_name
    FROM districts d
    LEFT JOIN regions r ON r.id = d.region_id
    WHERE d.id = ${districtId}::uuid
    LIMIT 1
  `;
  if (!row) return null;
  return { regionId: row.region_id, regionName: row.region_name };
}

export async function resolveOnboardingWorkLocation(args: {
  lat?: number | null;
  lng?: number | null;
  pincode?: string | null;
  stateHint?: string | null;
  districtHint?: string | null;
  cityHint?: string | null;
}): Promise<ResolvedWorkLocation> {
  const geo = await resolveGeoLocation({
    livePincode: args.pincode,
    liveState: args.stateHint,
    liveCity: args.cityHint ?? args.districtHint,
    latitude: args.lat,
    longitude: args.lng,
  });

  let stateId = geo.refs?.state ?? null;
  let regionId = geo.refs?.region ?? null;
  let districtId = geo.refs?.district ?? null;

  if (!stateId) {
    const matched = await matchStateByName(args.stateHint ?? geo.stateName);
    if (matched) stateId = matched.id;
  }

  if (stateId && !districtId) {
    const matched = await matchDistrictUnderState(
      stateId,
      args.districtHint,
      args.cityHint ?? geo.city,
    );
    if (matched) {
      districtId = matched.id;
      if (!regionId) regionId = matched.regionId;
    }
  }

  if (districtId && !regionId) {
    const sql = getSql();
    const [row] = await sql<{ region_id: string | null }[]>`
      SELECT region_id::text AS region_id FROM districts WHERE id = ${districtId}::uuid LIMIT 1`;
    regionId = row?.region_id ?? null;
  }

  if (regionId && !stateId) {
    const sql = getSql();
    const [row] = await sql<{ state_id: string | null }[]>`
      SELECT state_id::text AS state_id FROM regions WHERE id = ${regionId}::uuid LIMIT 1`;
    stateId = row?.state_id ?? null;
  }

  const names = await loadNames({ stateId, regionId, districtId });
  const covered = Boolean(stateId || regionId || districtId);
  const unmatched = !districtId;

  return {
    state: {
      id: stateId,
      name: names.state ?? geo.stateName ?? args.stateHint ?? null,
    },
    region: {
      id: regionId,
      name: names.region,
    },
    district: {
      id: districtId,
      name: names.district ?? args.districtHint ?? geo.city ?? null,
    },
    pincode: geo.pincode,
    city: geo.city,
    covered,
    unmatched,
    refs: { stateId, regionId, districtId },
  };
}
