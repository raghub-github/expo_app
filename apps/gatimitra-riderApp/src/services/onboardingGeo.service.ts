import { getRiderAppConfig } from "@/src/config/env";
import { getJson, postJson } from "@/src/services/http";

const API_BASE = () => getRiderAppConfig().apiBaseUrl.replace(/\/+$/, "");

export type GeoHierarchyNode = {
  id: string;
  name: string;
  foodEnabled?: boolean;
  parcelEnabled?: boolean;
  rideEnabled?: boolean;
  /** Present when listing districts by stateId (auto region fill). */
  regionId?: string | null;
  regionName?: string | null;
  /** Effective hiring at this geo node (states list). Default true when omitted. */
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

export type RiderIdentityMethodsResult = {
  success: boolean;
  digilocker: boolean;
  aadhaarMasking: boolean;
  manualUpload: boolean;
  mode: "manual" | "auto" | "hybrid" | "disabled";
  source: "geo" | "global";
  methods: {
    digilocker: boolean;
    aadhaarMasking: boolean;
    manualUpload: boolean;
  };
};

export async function fetchOnboardingStates(token: string) {
  return getJson<{ success: boolean; states: GeoHierarchyNode[] }>(
    `${API_BASE()}/v1/onboarding/geo/states`,
    { headers: { authorization: `Bearer ${token}` } },
  );
}

export async function fetchOnboardingRegions(token: string, stateId: string) {
  return getJson<{ success: boolean; regions: GeoHierarchyNode[] }>(
    `${API_BASE()}/v1/onboarding/geo/regions?stateId=${encodeURIComponent(stateId)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
}

export async function fetchOnboardingDistricts(
  token: string,
  opts: { stateId?: string; regionId?: string },
) {
  const qs = new URLSearchParams();
  if (opts.stateId) qs.set("stateId", opts.stateId);
  else if (opts.regionId) qs.set("regionId", opts.regionId);
  return getJson<{ success: boolean; districts: GeoHierarchyNode[] }>(
    `${API_BASE()}/v1/onboarding/geo/districts?${qs.toString()}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
}

export async function resolveOnboardingGeo(
  token: string,
  body: {
    lat?: number | null;
    lng?: number | null;
    pincode?: string | null;
    stateHint?: string | null;
    districtHint?: string | null;
    cityHint?: string | null;
  },
) {
  return postJson<{ success: boolean; location: ResolvedWorkLocation }>(
    `${API_BASE()}/v1/onboarding/geo/resolve`,
    body,
    { headers: { authorization: `Bearer ${token}` } },
  );
}

export async function saveOnboardingWorkLocation(
  token: string,
  body: Record<string, unknown>,
) {
  return postJson<{ success: boolean; location: Record<string, unknown> }>(
    `${API_BASE()}/v1/onboarding/work-location`,
    body,
    { headers: { authorization: `Bearer ${token}` } },
  );
}

export type RiderHiringStatusResult = {
  success: boolean;
  hiringAllowed: boolean;
  status: "HIRING" | "NOT_HIRING";
  source: "district" | "region" | "state" | "default" | "none";
  state?: string | null;
  region?: string | null;
  district?: string | null;
  resolvedGeo?: { level: string; refId: string } | null;
  explicit?: boolean;
};

export async function fetchRiderHiringStatus(
  token: string,
  params?: {
    riderId?: string;
    stateId?: string | null;
    regionId?: string | null;
    districtId?: string | null;
    state?: string | null;
    region?: string | null;
    district?: string | null;
    manualOther?: boolean;
  },
) {
  const qs = new URLSearchParams();
  if (params?.riderId) qs.set("riderId", params.riderId);
  if (params?.stateId) qs.set("stateId", params.stateId);
  if (params?.regionId) qs.set("regionId", params.regionId);
  if (params?.districtId) qs.set("districtId", params.districtId);
  if (params?.state) qs.set("state", params.state);
  if (params?.region) qs.set("region", params.region);
  if (params?.district) qs.set("district", params.district);
  if (params?.manualOther) qs.set("manualOther", "1");
  const suffix = qs.toString() ? `?${qs}` : "";
  return getJson<RiderHiringStatusResult>(
    `${API_BASE()}/v1/onboarding/hiring-status${suffix}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
}
