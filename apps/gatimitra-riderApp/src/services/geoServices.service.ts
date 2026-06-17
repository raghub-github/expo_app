import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";

export type GeoServiceAvailability = {
  found: boolean;
  food: boolean;
  parcel: boolean;
  ride: boolean;
  pincode: string | null;
  stateName: string | null;
  resolvedLevel: string | null;
};

export type GeoServiceAvailabilityResult =
  | { ok: true; availability: GeoServiceAvailability }
  | { ok: false; error: string };

function buildGeoServicesUrl(params: {
  pincode?: string;
  state?: string;
  lat?: number;
  lng?: number;
}): string {
  const base = getRiderAppConfig().apiBaseUrl.replace(/\/+$/, "");
  const qs = new URLSearchParams();
  if (params.pincode) qs.set("pincode", params.pincode);
  if (params.state) qs.set("state", params.state);
  if (params.lat != null) qs.set("lat", String(params.lat));
  if (params.lng != null) qs.set("lng", String(params.lng));
  return `${base}/v1/geo/services?${qs.toString()}`;
}

export async function getGeoServiceAvailability(params: {
  pincode?: string;
  state?: string;
  lat?: number;
  lng?: number;
}): Promise<GeoServiceAvailabilityResult> {
  try {
    const data = await getJson<GeoServiceAvailability & { ok?: boolean }>(
      buildGeoServicesUrl(params),
    );
    if (!data?.ok && data?.found !== true && data?.found !== false) {
      return { ok: false, error: "Service availability unavailable" };
    }
    const { ok: _ok, ...availability } = data;
    return { ok: true, availability };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Could not fetch service availability";
    return { ok: false, error: message };
  }
}
