/**
 * Compare rider's saved WORKING location with current GPS (duty ON gate).
 * Registered address is separate and must NOT be used for this check.
 */
import { resolveOnboardingWorkLocation } from "./rider-onboarding-geo.js";
import { resolveRiderHiring } from "./rider-geo-hiring.js";

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

function norm(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function idsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  return Boolean(x && y && x === y);
}

function namesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

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

  const stateMatches =
    idsEqual(working.stateId, detected.stateId) || namesEqual(working.state, detected.state);

  let mismatch = !stateMatches;
  if (!mismatch) {
    const bothHaveDistrict =
      Boolean(working.districtId || working.district) &&
      Boolean(detected.districtId || detected.district);
    if (bothHaveDistrict) {
      const districtMatches =
        idsEqual(working.districtId, detected.districtId) ||
        namesEqual(working.district, detected.district);
      if (!districtMatches) mismatch = true;
    }
  }

  if (!mismatch) {
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
