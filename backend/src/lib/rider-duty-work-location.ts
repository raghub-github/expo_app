/**
 * Compare rider's saved WORKING location with current GPS (duty ON gate).
 * Registered address is separate and must NOT be used for this check.
 */
import { getSql } from "../db/client.js";
import { resolveOnboardingWorkLocation } from "./rider-onboarding-geo.js";
import { resolveRiderHiring } from "./rider-geo-hiring.js";
import {
  decideWorkLocationMatch,
  resolveDistrictIdByName,
} from "./rider-work-location-match.js";

/** A state's districts (id + name) — tiny, changes rarely; cached per state. */
const STATE_DISTRICTS_TTL_MS = 10 * 60_000;
const stateDistrictsCache = new Map<
  string,
  { at: number; rows: Array<{ id: string; name: string }> }
>();

async function loadStateDistricts(stateId: string): Promise<Array<{ id: string; name: string }>> {
  const hit = stateDistrictsCache.get(stateId);
  if (hit && Date.now() - hit.at < STATE_DISTRICTS_TTL_MS) return hit.rows;
  const rows = (await getSql()`
    SELECT d.id::text AS id, d.name
    FROM districts d
    JOIN regions r ON r.id = d.region_id
    WHERE r.state_id = ${stateId}::uuid
  `) as unknown as Array<{ id: string; name: string }>;
  stateDistrictsCache.set(stateId, { at: Date.now(), rows });
  return rows;
}

/**
 * The working district as a KNOWN districts.id: the stored id, else the saved
 * name resolved exactly within the state. null = unknown (free text / alias),
 * which cannot prove a mismatch. Lookup failure → unknown, never a lock-out.
 */
async function resolveWorkingDistrictId(
  working: { districtId: string | null; district: string | null },
  stateId: string | null
): Promise<string | null> {
  if (working.districtId) return working.districtId;
  if (!working.district || !stateId) return null;
  try {
    return resolveDistrictIdByName(working.district, await loadStateDistricts(stateId));
  } catch {
    return null;
  }
}

export type DutyWorkLocationSnapshot = {
  state: string | null;
  district: string | null;
  region: string | null;
  stateId: string | null;
  regionId: string | null;
  districtId: string | null;
  lat?: number | null;
  lon?: number | null;
};

export type DutyWorkLocationCheckResult = {
  mismatch: boolean;
  hiringAllowed: boolean;
  working: DutyWorkLocationSnapshot;
  detected: DutyWorkLocationSnapshot | null;
  message: string | null;
  /** @deprecated alias of working — kept for older app builds */
  registered: DutyWorkLocationSnapshot;
};

/**
 * Single GPS → geo resolve reused for mismatch + hiring. Soft-skip when working
 * location is missing or GPS cannot be resolved to hierarchy.
 */
export async function checkDutyWorkingLocation(args: {
  working: {
    state?: string | null;
    district?: string | null;
    region?: string | null;
    stateId?: string | null;
    regionId?: string | null;
    districtId?: string | null;
    locationOtherState?: string | null;
    locationOtherDistrict?: string | null;
  };
  lat: number;
  lon: number;
}): Promise<DutyWorkLocationCheckResult> {
  const workingState =
    String(args.working.state || args.working.locationOtherState || "").trim() || null;
  const workingDistrict =
    String(args.working.district || args.working.locationOtherDistrict || "").trim() || null;
  const working: DutyWorkLocationSnapshot = {
    state: workingState,
    district: workingDistrict,
    region: String(args.working.region || "").trim() || null,
    stateId: args.working.stateId ?? null,
    regionId: args.working.regionId ?? null,
    districtId: args.working.districtId ?? null,
  };

  if (!working.state && !working.stateId) {
    return {
      mismatch: false,
      hiringAllowed: true,
      working,
      detected: null,
      message: null,
      registered: working,
    };
  }

  const resolved = await resolveOnboardingWorkLocation({
    lat: args.lat,
    lng: args.lon,
  });

  const detected: DutyWorkLocationSnapshot = {
    state: resolved.state.name,
    district: resolved.district.name,
    region: resolved.region.name,
    stateId: resolved.refs.stateId,
    regionId: resolved.refs.regionId,
    districtId: resolved.refs.districtId,
    lat: args.lat,
    lon: args.lon,
  };

  const hiring = await resolveRiderHiring({
    stateId: detected.stateId,
    regionId: detected.regionId,
    districtId: detected.districtId,
    stateName: detected.state,
    regionName: detected.region,
    districtName: detected.district,
  });

  if (!detected.stateId && !detected.state) {
    return {
      mismatch: false,
      hiringAllowed: hiring.hiringAllowed,
      working,
      detected,
      message: null,
      registered: working,
    };
  }

  const knownWorkingDistrictId = await resolveWorkingDistrictId(
    working,
    working.stateId ?? detected.stateId
  );
  const decision = decideWorkLocationMatch(
    {
      stateId: working.stateId,
      state: working.state,
      districtId: knownWorkingDistrictId,
      district: working.district,
    },
    {
      stateId: detected.stateId,
      state: detected.state,
      districtId: detected.districtId,
      district: detected.district,
    }
  );

  if (!decision.mismatch) {
    return {
      mismatch: false,
      hiringAllowed: hiring.hiringAllowed,
      working,
      detected,
      message: null,
      registered: working,
    };
  }

  const from =
    [working.district, working.state].filter(Boolean).join(", ") || "your working location";
  const to =
    [detected.district, detected.state].filter(Boolean).join(", ") || "your current location";

  return {
    mismatch: true,
    hiringAllowed: hiring.hiringAllowed,
    working,
    detected,
    message: `Your current location is different from your working location. Your registered working location is ${from}, but your current location is ${to}. To go ON-DUTY here, you need to update your working location first.`,
    registered: working,
  };
}

/** @deprecated use checkDutyWorkingLocation */
export async function assessDutyWorkLocationMismatch(args: {
  registered: {
    state?: string | null;
    district?: string | null;
    region?: string | null;
    stateId?: string | null;
    regionId?: string | null;
    districtId?: string | null;
    locationOtherState?: string | null;
    locationOtherDistrict?: string | null;
  };
  lat: number;
  lon: number;
}) {
  const result = await checkDutyWorkingLocation({
    working: args.registered,
    lat: args.lat,
    lon: args.lon,
  });
  if (!result.mismatch) {
    return { mismatch: false as const, registered: result.working, detected: result.detected };
  }
  return {
    mismatch: true as const,
    registered: result.working,
    detected: result.detected!,
  };
}
